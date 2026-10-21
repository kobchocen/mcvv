/**
 * Offline fronta webového klienta mezičasů (#121) – čistá logika bez prohlížečových API.
 *
 * - `records`: co obsluha vidí (jeden řádek = jeden průběh běžce);
 * - `outbox`: operace k odeslání v pořadí (create / correct / delete), každá s UUID.
 * Server je idempotentní podle UUID, takže opakované odeslání po výpadku nic nezdvojí.
 * Oprava ještě neodeslaného zápisu se udělá přímo v outboxu (na server jde jen výsledek).
 */
import type { WebEntry } from "./ingest-core";

export type RecordState =
  | "draft" // razítko bez čísla, čeká na doplnění
  | "pending" // čeká na odeslání
  | "applied"
  | "duplicate"
  | "rejected"
  | "deleted"
  | "error";

export type SplitRecord = {
  /** UUID prvního zápisu (stabilní klíč řádku). */
  id: string;
  /** UUID poslední operace, kterou server zná / pozná (create nebo correct). */
  currentKey: string;
  split: string;
  bib: number | null;
  punchedAt: number;
  state: RecordState;
  time?: number | null;
  existingTime?: number;
  note?: string;
};

export type OutboxOp = WebEntry & { attempts: number };

export type QueueState = {
  records: SplitRecord[];
  outbox: OutboxOp[];
  /** Kdy zkusit odeslat znovu (ms epoch). */
  nextAttemptAt: number;
  failures: number;
};

export const EMPTY_QUEUE: QueueState = { records: [], outbox: [], nextAttemptAt: 0, failures: 0 };
export const MAX_RECORDS = 500;

export type IdFactory = () => string;

function trim(records: SplitRecord[]): SplitRecord[] {
  return records.length > MAX_RECORDS ? records.slice(0, MAX_RECORDS) : records;
}

/** Nový průběh. `bib === null` = razítko bez čísla (draft, neodesílá se). */
export function addPunch(
  state: QueueState,
  input: { split: string; bib: number | null; punchedAt: number },
  newId: IdFactory,
): QueueState {
  const id = newId();
  const record: SplitRecord = {
    id,
    currentKey: id,
    split: input.split,
    bib: input.bib,
    punchedAt: input.punchedAt,
    state: input.bib === null ? "draft" : "pending",
  };
  const outbox =
    input.bib === null
      ? state.outbox
      : [
          ...state.outbox,
          {
            action: "create" as const,
            id,
            split: input.split,
            bib: input.bib,
            punchedAt: input.punchedAt,
            attempts: 0,
          },
        ];
  return { ...state, records: trim([record, ...state.records]), outbox, nextAttemptAt: 0 };
}

/** Už zapsané (a nesmazané) číslo na stanovišti – pro varování před dvojím zápisem. */
export function findActiveBib(state: QueueState, split: string, bib: number): SplitRecord | null {
  return (
    state.records.find(
      (record) =>
        record.split === split &&
        record.bib === bib &&
        record.state !== "deleted" &&
        record.state !== "rejected" &&
        record.state !== "error",
    ) ?? null
  );
}

function updateRecord(
  state: QueueState,
  id: string,
  patch: (record: SplitRecord) => SplitRecord,
): SplitRecord[] {
  return state.records.map((record) => (record.id === id ? patch(record) : record));
}

/** Oprava čísla (i doplnění čísla k razítku). */
export function correctBib(
  state: QueueState,
  recordId: string,
  bib: number,
  newId: IdFactory,
  inFlight: ReadonlySet<string> = new Set(),
): QueueState {
  const record = state.records.find((r) => r.id === recordId);
  if (!record || record.state === "deleted" || record.bib === bib) return state;
  if (record.state === "draft") {
    return {
      ...state,
      records: updateRecord(state, recordId, (r) => ({ ...r, bib, state: "pending" })),
      outbox: [
        ...state.outbox,
        {
          action: "create",
          id: record.currentKey,
          split: record.split,
          bib,
          punchedAt: record.punchedAt,
          attempts: 0,
        },
      ],
      nextAttemptAt: 0,
    };
  }
  const unsent = state.outbox.findIndex(
    (op) => op.id === record.currentKey && !inFlight.has(op.id) && op.action !== "delete",
  );
  if (unsent !== -1) {
    const outbox = state.outbox.map((op, index) =>
      index === unsent && op.action !== "delete" ? { ...op, bib } : op,
    );
    return {
      ...state,
      outbox,
      records: updateRecord(state, recordId, (r) => ({ ...r, bib, state: "pending" })),
      nextAttemptAt: 0,
    };
  }
  if (record.state === "rejected" || record.state === "error") {
    // server zápis nepřijal → pošle se jako nový zápis se stejným razítkem
    const id = newId();
    return {
      ...state,
      records: updateRecord(state, recordId, (r) => ({
        ...r,
        bib,
        currentKey: id,
        state: "pending",
        note: undefined,
      })),
      outbox: [
        ...state.outbox,
        {
          action: "create",
          id,
          split: record.split,
          bib,
          punchedAt: record.punchedAt,
          attempts: 0,
        },
      ],
      nextAttemptAt: 0,
    };
  }
  const id = newId();
  return {
    ...state,
    records: updateRecord(state, recordId, (r) => ({
      ...r,
      bib,
      currentKey: id,
      state: "pending",
    })),
    outbox: [
      ...state.outbox,
      {
        action: "correct",
        id,
        replaces: record.currentKey,
        split: record.split,
        bib,
        punchedAt: record.punchedAt,
        attempts: 0,
      },
    ],
    nextAttemptAt: 0,
  };
}

export function deleteRecord(
  state: QueueState,
  recordId: string,
  newId: IdFactory,
  inFlight: ReadonlySet<string> = new Set(),
): QueueState {
  const record = state.records.find((r) => r.id === recordId);
  if (!record || record.state === "deleted") return state;
  const markDeleted = updateRecord(state, recordId, (r) => ({ ...r, state: "deleted" }));
  if (record.state === "draft" || record.state === "rejected" || record.state === "error") {
    return { ...state, records: markDeleted };
  }
  const unsent = state.outbox.findIndex(
    (op) => op.id === record.currentKey && !inFlight.has(op.id) && op.action === "create",
  );
  if (unsent !== -1) {
    return { ...state, records: markDeleted, outbox: state.outbox.filter((_, i) => i !== unsent) };
  }
  // pokud čeká neodeslaná oprava, nahradí ji smazání původního klíče
  const pendingCorrect = state.outbox.findIndex(
    (op) => op.id === record.currentKey && !inFlight.has(op.id) && op.action === "correct",
  );
  if (pendingCorrect !== -1) {
    const correction = state.outbox[pendingCorrect] as Extract<OutboxOp, { action: "correct" }>;
    const outbox = state.outbox.filter((_, i) => i !== pendingCorrect);
    return {
      ...state,
      records: markDeleted,
      outbox: [
        ...outbox,
        {
          action: "delete",
          id: newId(),
          replaces: correction.replaces,
          split: record.split,
          attempts: 0,
        },
      ],
      nextAttemptAt: 0,
    };
  }
  return {
    ...state,
    records: markDeleted,
    outbox: [
      ...state.outbox,
      {
        action: "delete",
        id: newId(),
        replaces: record.currentKey,
        split: record.split,
        attempts: 0,
      },
    ],
    nextAttemptAt: 0,
  };
}

export type ServerResult = {
  id: string;
  outcome: string;
  time?: number | null;
  existingTime?: number;
  note?: string;
};

function stateFromOutcome(outcome: string): RecordState {
  switch (outcome) {
    case "applied":
    case "resolved":
    case "unchanged":
      return "applied";
    case "duplicate":
      return "duplicate";
    case "deleted":
      return "deleted";
    case "replaced":
      return "applied";
    default:
      return "rejected";
  }
}

/** Potvrzení ze serveru: odebere operace z outboxu a promítne výsledek do řádků. */
export function applyAck(state: QueueState, results: ServerResult[]): QueueState {
  const byId = new Map(results.map((result) => [result.id, result]));
  const outbox = state.outbox.filter((op) => !byId.has(op.id));
  const records = state.records.map((record) => {
    const result = byId.get(record.currentKey);
    if (!result || record.state === "deleted") return record;
    return {
      ...record,
      state: stateFromOutcome(result.outcome),
      time: result.time ?? record.time,
      existingTime: result.existingTime,
      note: result.note,
    };
  });
  return { ...state, outbox, records, failures: 0, nextAttemptAt: 0 };
}

/** Server operace odmítl validací (4xx) – nezkoušet donekonečna, ukázat obsluze. */
export function markFailed(state: QueueState, ids: string[]): QueueState {
  const failed = new Set(ids);
  return {
    ...state,
    outbox: state.outbox.filter((op) => !failed.has(op.id)),
    records: state.records.map((record) =>
      failed.has(record.currentKey) && record.state !== "deleted"
        ? { ...record, state: "error" }
        : record,
    ),
  };
}

/** Exponenciální backoff 1 s → 30 s s náhodným rozptylem (síť v lese). */
export function backoffMs(failures: number, random = Math.random()): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.min(failures, 5));
  return Math.round(base * (0.75 + random * 0.5));
}

export function scheduleRetry(state: QueueState, now: number, random?: number): QueueState {
  const failures = state.failures + 1;
  return {
    ...state,
    failures,
    nextAttemptAt: now + backoffMs(failures, random),
    outbox: state.outbox.map((op) => ({ ...op, attempts: op.attempts + 1 })),
  };
}

/** Dávka k odeslání (bez interního počítadla pokusů). */
export function nextBatch(state: QueueState, max = 50): WebEntry[] {
  return state.outbox.slice(0, max).map((op) => {
    const { attempts: _attempts, ...entry } = op;
    void _attempts;
    return entry as WebEntry;
  });
}

/** Korekce hodin: offset = server − střed požadavku; bere vzorek s nejkratším RTT. */
export function clockSample(sentAt: number, receivedAt: number, serverNow: number) {
  const rtt = receivedAt - sentAt;
  return { offset: serverNow - (sentAt + rtt / 2), rtt };
}

export function pickOffset(samples: { offset: number; rtt: number }[]): number | null {
  if (samples.length === 0) return null;
  return Math.round([...samples].sort((a, b) => a.rtt - b.rtt)[0].offset);
}

/** Načtení uloženého stavu (IndexedDB / localStorage) s ochranou proti poškozeným datům. */
export function reviveQueue(raw: unknown): QueueState {
  if (!raw || typeof raw !== "object") return EMPTY_QUEUE;
  const value = raw as Partial<QueueState>;
  return {
    records: Array.isArray(value.records) ? value.records : [],
    outbox: Array.isArray(value.outbox) ? value.outbox : [],
    nextAttemptAt: 0,
    failures: 0,
  };
}
