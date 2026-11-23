/**
 * Offline fronta stanic v cíli (#252) – čistá logika bez prohlížečových API.
 *
 * Stopky i Čísla zapisují do vlastní fronty v zařízení (IndexedDB). Každý zápis má UUID,
 * server je podle něj idempotentní, takže opakované odeslání po výpadku sítě nic nezdvojí.
 * Smazání ještě neodeslaného zápisu se vyřeší přímo ve frontě (na server nejde nic).
 */
import { FINISH_BIB_MAX, type FinishOp, type FinishOpResult } from "./finish-core";

export type StationKind = "watch" | "bibs";

export type StationRecordState = "pending" | "applied" | "duplicate" | "rejected" | "deleted";

export type StationRecord = {
  id: string;
  kind: "punch" | "bib";
  at: number;
  bib?: number;
  state: StationRecordState;
  note?: string;
};

export type FinishQueue = {
  records: StationRecord[];
  outbox: FinishOp[];
  nextAttemptAt: number;
  failures: number;
};

export const EMPTY_FINISH_QUEUE: FinishQueue = {
  records: [],
  outbox: [],
  nextAttemptAt: 0,
  failures: 0,
};
export const FINISH_QUEUE_MAX = 2000;

export type IdFactory = () => string;

function trim(records: StationRecord[]): StationRecord[] {
  return records.length > FINISH_QUEUE_MAX ? records.slice(0, FINISH_QUEUE_MAX) : records;
}

/** Klik stopek (okamžik po korekci hodin). */
export function addFinishPunch(state: FinishQueue, at: number, newId: IdFactory): FinishQueue {
  const id = newId();
  return {
    ...state,
    records: trim([{ id, kind: "punch", at, state: "pending" }, ...state.records]),
    outbox: [...state.outbox, { kind: "punch", id, at }],
    nextAttemptAt: 0,
  };
}

/** Opsané číslo (pořadí = okamžik opsání). Neplatné číslo frontu nemění. */
export function addFinishBib(
  state: FinishQueue,
  bib: number,
  at: number,
  newId: IdFactory,
): FinishQueue {
  if (!Number.isInteger(bib) || bib < 1 || bib > FINISH_BIB_MAX) return state;
  const id = newId();
  return {
    ...state,
    records: trim([{ id, kind: "bib", at, bib, state: "pending" }, ...state.records]),
    outbox: [...state.outbox, { kind: "bib", id, at, bib }],
    nextAttemptAt: 0,
  };
}

/** Smazání zápisu (přebytečný klik, omylem opsané číslo). */
export function deleteFinishRecord(
  state: FinishQueue,
  recordId: string,
  newId: IdFactory,
  inFlight: ReadonlySet<string> = new Set(),
): FinishQueue {
  const record = state.records.find((r) => r.id === recordId);
  if (!record || record.state === "deleted" || record.state === "rejected") return state;
  const records = state.records.map((r) =>
    r.id === recordId ? { ...r, state: "deleted" as const } : r,
  );
  const unsent = state.outbox.some((op) => op.id === recordId) && !inFlight.has(recordId);
  if (unsent) {
    return { ...state, records, outbox: state.outbox.filter((op) => op.id !== recordId) };
  }
  return {
    ...state,
    records,
    outbox: [...state.outbox, { kind: "delete", id: newId(), target: recordId }],
    nextAttemptAt: 0,
  };
}

/** Odpověď serveru: odeslané operace z fronty ven, stav záznamů podle výsledku. */
export function applyFinishAck(
  state: FinishQueue,
  results: readonly FinishOpResult[],
): FinishQueue {
  const byId = new Map(results.map((r) => [r.id, r]));
  const records = state.records.map((record) => {
    const result = byId.get(record.id);
    if (!result || record.state === "deleted") return record;
    if (result.outcome === "applied") return { ...record, state: "applied" as const };
    if (result.outcome === "duplicate") return { ...record, state: "duplicate" as const };
    return { ...record, state: "rejected" as const, note: result.note ?? result.outcome };
  });
  return {
    ...state,
    records,
    outbox: state.outbox.filter((op) => !byId.has(op.id)),
    failures: 0,
    nextAttemptAt: 0,
  };
}

/** Výpadek: zkusit znovu s rostoucím odstupem (1 s … 30 s). */
export function scheduleFinishRetry(state: FinishQueue, now: number): FinishQueue {
  const failures = state.failures + 1;
  return { ...state, failures, nextAttemptAt: now + Math.min(30_000, 1000 * 2 ** (failures - 1)) };
}

export function nextFinishBatch(state: FinishQueue, max = 50): FinishOp[] {
  return state.outbox.slice(0, max);
}

/** Počty pro hlavičku stanice (smazané se nepočítají). */
export function countFinish(state: FinishQueue, kind: "punch" | "bib") {
  const rows = state.records.filter((r) => r.kind === kind && r.state !== "deleted");
  return {
    total: rows.filter((r) => r.state !== "rejected").length,
    pending: rows.filter((r) => r.state === "pending").length,
    rejected: rows.filter((r) => r.state === "rejected").length,
  };
}

export function reviveFinishQueue(raw: unknown): FinishQueue {
  if (!raw || typeof raw !== "object") return EMPTY_FINISH_QUEUE;
  const value = raw as Partial<FinishQueue>;
  return {
    records: Array.isArray(value.records) ? value.records : [],
    outbox: Array.isArray(value.outbox) ? value.outbox : [],
    nextAttemptAt: 0,
    failures: 0,
  };
}

export const FINISH_STATIONS: readonly StationKind[] = ["watch", "bibs"];

/**
 * Které fronty stanic se mají teď odeslat (#366): obě stanice, ne jen zvolená – zvolená první.
 * Fronta je na řadě, když má co odeslat a nečeká na další pokus po výpadku.
 */
export function dueFinishStations(
  queues: Readonly<Record<StationKind, FinishQueue>>,
  now: number,
  active: StationKind,
): StationKind[] {
  return [active, ...FINISH_STATIONS.filter((station) => station !== active)].filter(
    (station) => queues[station].outbox.length > 0 && now >= queues[station].nextAttemptAt,
  );
}

/** Kolik čeká v druhé (nezvolené) stanici – ukazuje se v hlavičce, ať nezapadne. */
export function otherStationPending(
  queues: Readonly<Record<StationKind, FinishQueue>>,
  active: StationKind,
): { station: StationKind; count: number } | null {
  const station = active === "watch" ? "bibs" : "watch";
  const count = queues[station].outbox.length;
  return count > 0 ? { station, count } : null;
}

export function finishQueueKey(year: number, userId: number, kind: StationKind): string {
  return `finish:${kind}:${year}:${userId}`;
}
