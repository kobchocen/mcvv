import { Prisma } from "@prisma/client";

import { writeAudit } from "@/lib/audit/log";
import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

import {
  checkPunch,
  decideDeviceDelete,
  decideDeviceWrite,
  decideWrite,
  deviceEntryKey,
  nextDeviceEntryKey,
  OWNING_OUTCOMES,
  SUPERSEDED_OUTCOMES,
  type DeviceItem,
  type Outcome,
  type WebEntry,
} from "./ingest-core";
import { conflictStillCurrent } from "./manual-core";
import type { RaceContext } from "./race-context";
import { startInstant } from "./start-time";
import { webAuthor } from "./stations";

type Tx = Prisma.TransactionClient;

export type EntryResult = {
  id: string;
  outcome: Outcome;
  bib?: number;
  time?: number | null;
  /** Hodnota, která už v mcvv_split je (duplicita / konflikt). */
  existingTime?: number;
  note?: string;
};

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function knownBib(tx: Tx, year: number, bib: number): Promise<boolean> {
  const row = await tx.startEntry.findFirst({ where: { year, bib }, select: { bib: true } });
  return row !== null;
}

/** Zapíše řádek mcvv_split podle pravidla `decideWrite`. */
async function writeSplit(
  tx: Tx,
  input: { year: number; split: string; bib: number; time: number; author: string; now: Date },
  source: "web" | "obd",
): Promise<{ outcome: Outcome; existingTime?: number }> {
  const existing = await tx.split.findUnique({
    where: { bib_year_split: { bib: input.bib, year: input.year, split: input.split } },
    select: { time: true },
  });
  const decision = decideWrite(existing, input.time, source);
  if (decision === "insert") {
    await tx.split.create({
      data: {
        bib: input.bib,
        year: input.year,
        split: input.split,
        time: input.time,
        created: input.now,
        author: input.author,
      },
    });
    return { outcome: "applied" };
  }
  if (decision === "duplicate") return { outcome: "duplicate", existingTime: existing!.time };
  if (decision === "unchanged") return { outcome: "unchanged", existingTime: existing!.time };
  return { outcome: "conflict", existingTime: existing!.time };
}

/** Smaže řádek mcvv_split, jen když ho opravdu vlastní daný zápis (stejné číslo i čas). */
async function releaseOwnedSplit(
  tx: Tx,
  original: { year: number; split: string; bib: number; time: number | null; outcome: string },
): Promise<boolean> {
  if (!OWNING_OUTCOMES.includes(original.outcome as Outcome) || original.time === null) {
    return false;
  }
  const removed = await tx.split.deleteMany({
    where: { bib: original.bib, year: original.year, split: original.split, time: original.time },
  });
  return removed.count > 0;
}

function storedResult(row: {
  entryKey: string;
  outcome: string;
  bib: number;
  time: number | null;
  note: string | null;
}): EntryResult {
  return {
    id: row.entryKey,
    outcome: row.outcome as Outcome,
    bib: row.bib,
    time: row.time,
    note: row.note ?? undefined,
  };
}

async function applyWebEntry(
  tx: Tx,
  entry: WebEntry,
  ctx: RaceContext,
  user: { id: number },
  now: Date,
): Promise<EntryResult> {
  const previous = await tx.splitEntry.findUnique({ where: { entryKey: entry.id } });
  if (previous) return storedResult(previous);

  const author = webAuthor(entry.split);
  const base = {
    entryKey: entry.id,
    year: ctx.year,
    split: entry.split,
    source: "web",
    action: entry.action,
    author,
    userId: user.id,
  };

  let original: Awaited<ReturnType<typeof tx.splitEntry.findUnique>> = null;
  if (entry.action !== "create") {
    original = await tx.splitEntry.findUnique({ where: { entryKey: entry.replaces } });
    if (!original || original.year !== ctx.year || original.split !== entry.split) {
      const row = await tx.splitEntry.create({
        data: {
          ...base,
          bib: entry.action === "delete" ? 0 : entry.bib,
          replaces: entry.replaces,
          outcome: "rejected",
          note: "original-missing",
        },
      });
      return storedResult(row);
    }
    await releaseOwnedSplit(tx, original);
    await tx.splitEntry.update({
      where: { id: original.id },
      data: { outcome: entry.action === "delete" ? "deleted" : "replaced" },
    });
    if (entry.action === "delete") {
      const row = await tx.splitEntry.create({
        data: {
          ...base,
          bib: original.bib,
          time: original.time,
          replaces: entry.replaces,
          outcome: "deleted",
        },
      });
      return storedResult(row);
    }
  }

  // create / correct: spočítat čas od startu daného čísla
  const punchedAt = entry.punchedAt;
  const check = checkPunch(punchedAt, startInstant(ctx.zero, entry.bib, ctx.intervalS), now);
  if (!check.ok) {
    const row = await tx.splitEntry.create({
      data: {
        ...base,
        bib: entry.bib,
        punchedAt: new Date(punchedAt),
        replaces: original?.entryKey ?? null,
        outcome: "rejected",
        note: check.reason,
      },
    });
    return storedResult(row);
  }
  const written = await writeSplit(
    tx,
    { year: ctx.year, split: entry.split, bib: entry.bib, time: check.time, author, now },
    "web",
  );
  const notes = [
    (await knownBib(tx, ctx.year, entry.bib)) ? null : "unknown-bib",
    written.existingTime !== undefined ? `existing=${written.existingTime}` : null,
  ].filter(Boolean);
  const row = await tx.splitEntry.create({
    data: {
      ...base,
      bib: entry.bib,
      time: check.time,
      punchedAt: new Date(punchedAt),
      replaces: original?.entryKey ?? null,
      outcome: written.outcome,
      note: notes.length > 0 ? notes.join(";") : null,
    },
  });
  return { ...storedResult(row), existingTime: written.existingTime };
}

/** Dávka z webového klienta splitmakera. Pořadí položek je zachované (oprava po zápisu). */
export async function applyWebEntries(
  entries: WebEntry[],
  ctx: RaceContext,
  user: { id: number },
  now = new Date(),
): Promise<EntryResult[]> {
  const results: EntryResult[] = [];
  for (const entry of entries) {
    results.push(await withRetry(entry.id, () => applyWebEntryTx(entry, ctx, user, now)));
  }
  return results;
}

function applyWebEntryTx(entry: WebEntry, ctx: RaceContext, user: { id: number }, now: Date) {
  return prisma.$transaction((tx) => applyWebEntry(tx, entry, ctx, user, now));
}

/** Souběh (dvě zařízení, stejné číslo / stejný klíč): zopakovat jednou, pak už je vše idempotentní. */
async function withRetry(id: string, run: () => Promise<EntryResult>): Promise<EntryResult> {
  try {
    return await run();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    try {
      return await run();
    } catch (second) {
      if (!isUniqueViolation(second)) throw second;
      return { id, outcome: "duplicate", note: "concurrent" };
    }
  }
}

/**
 * Zápisy na stanoviště, které účtu není přiřazené: nic se nezapíše, do deníku jde `rejected`
 * s poznámkou (admin to vidí v přehledu) a klient dostane výsledek po položkách, takže mu
 * zápis nezůstane viset ve frontě. Idempotentní podle `id` zápisu.
 */
export async function rejectWebEntries(
  entries: WebEntry[],
  ctx: RaceContext,
  user: { id: number },
  note: string,
): Promise<EntryResult[]> {
  const results: EntryResult[] = [];
  for (const entry of entries) {
    results.push(
      await withRetry(entry.id, async () => {
        const previous = await prisma.splitEntry.findUnique({ where: { entryKey: entry.id } });
        if (previous) return storedResult(previous);
        const row = await prisma.splitEntry.create({
          data: {
            entryKey: entry.id,
            year: ctx.year,
            split: entry.split,
            bib: entry.action === "delete" ? 0 : entry.bib,
            punchedAt: entry.action === "delete" ? null : new Date(entry.punchedAt),
            source: "web",
            action: entry.action,
            replaces: entry.action === "create" ? null : entry.replaces,
            outcome: "rejected",
            note,
            author: webAuthor(entry.split),
            userId: user.id,
          },
        });
        return storedResult(row);
      }),
    );
  }
  return results;
}

export type DeviceToken = { id: number; year: number; author: string };

/** Řádek mcvv_split pro (rok, split, číslo) a zápis z OBD, který ho vlastní (pokud nějaký). */
async function currentSplit(tx: Tx, year: number, split: string, bib: number) {
  const row = await tx.split.findUnique({
    where: { bib_year_split: { bib, year, split } },
    select: { time: true },
  });
  if (!row) return { row: null, owner: null };
  const owner = await tx.splitEntry.findFirst({
    where: { year, split, bib, time: row.time, outcome: { in: OWNING_OUTCOMES } },
    orderBy: { id: "desc" },
  });
  return { row, owner };
}

async function applyDeviceItem(
  tx: Tx,
  item: DeviceItem,
  token: DeviceToken,
  now: Date,
): Promise<EntryResult> {
  const base = deviceEntryKey(token.id, item);
  // Idempotence: poslední zápis se stejným klíčem platí, dokud ho nepřepsala/nesmazala novější verze souboru.
  const previous = await tx.splitEntry.findMany({
    where: { OR: [{ entryKey: base }, { entryKey: { startsWith: `${base}#` } }] },
    orderBy: { id: "desc" },
  });
  const latest = previous[0];
  if (latest && !SUPERSEDED_OUTCOMES.includes(latest.outcome as Outcome)) {
    return storedResult(latest);
  }
  const entryKey = nextDeviceEntryKey(
    base,
    previous.map((row) => row.entryKey),
  );
  const { row: existing, owner } = await currentSplit(tx, token.year, item.split, item.bib);
  const ownedByObd = owner?.source === "obd";
  const state = existing ? { time: existing.time, ownedByObd } : null;
  const unknown = (await knownBib(tx, token.year, item.bib)) ? null : "unknown-bib";
  const entry = {
    entryKey,
    year: token.year,
    split: item.split,
    bib: item.bib,
    time: item.timeS,
    source: "obd",
    author: token.author,
    tokenId: token.id,
  };

  if (item.action === "delete") {
    const decision = decideDeviceDelete(state, item.timeS);
    if (decision === "delete" && owner) {
      await releaseOwnedSplit(tx, owner);
      await tx.splitEntry.update({ where: { id: owner.id }, data: { outcome: "deleted" } });
    }
    const row = await tx.splitEntry.create({
      data: {
        ...entry,
        action: "delete",
        replaces: decision === "delete" ? (owner?.entryKey ?? null) : null,
        outcome: decision === "delete" ? "deleted" : "unchanged",
        note: decision === "delete" ? null : decision,
      },
    });
    return { ...storedResult(row), existingTime: existing?.time };
  }

  const decision = decideDeviceWrite(state, item.timeS, item.replace);
  let outcome: Outcome;
  if (decision === "insert") {
    await tx.split.create({
      data: {
        bib: item.bib,
        year: token.year,
        split: item.split,
        time: item.timeS,
        created: now,
        author: token.author,
      },
    });
    outcome = "applied";
  } else if (decision === "replace" && owner) {
    // Jen s přepínačem applyCorrections: přepsat hodnotu, kterou zapsalo OBD (legacy by ji zahodil).
    await tx.split.updateMany({
      where: { bib: item.bib, year: token.year, split: item.split, time: existing!.time },
      data: { time: item.timeS, created: now, author: token.author },
    });
    await tx.splitEntry.update({ where: { id: owner.id }, data: { outcome: "replaced" } });
    outcome = "applied";
  } else {
    outcome = decision === "unchanged" ? "unchanged" : "conflict";
  }
  const notes = [
    unknown,
    existing && existing.time !== item.timeS ? `existing=${existing.time}` : null,
  ].filter(Boolean);
  const row = await tx.splitEntry.create({
    data: {
      ...entry,
      action: decision === "replace" ? "correct" : "create",
      replaces: decision === "replace" ? (owner?.entryKey ?? null) : null,
      outcome,
      note: notes.length > 0 ? notes.join(";") : null,
    },
  });
  return {
    ...storedResult(row),
    existingTime: existing && existing.time !== item.timeS ? existing.time : undefined,
  };
}

/** Dávka z klienta na cílovém PC (OBD). */
export async function applyDeviceItems(
  items: DeviceItem[],
  token: DeviceToken,
  now = new Date(),
): Promise<EntryResult[]> {
  const results: EntryResult[] = [];
  for (const item of items) {
    const key = deviceEntryKey(token.id, item);
    results.push(
      await withRetry(key, () =>
        prisma.$transaction((tx) => applyDeviceItem(tx, item, token, now)),
      ),
    );
  }
  return results;
}

export type ConflictDecision = "ok" | "missing" | "stale";

/**
 * Admin: přijmout hodnotu z konfliktu (přepíše mcvv_split). Jen pokud v mcvv_split pořád je
 * hodnota, proti které konflikt vznikl – jinak (mezitím ruční oprava, smazání, jiný přijatý
 * konflikt) `stale` a nic se nemění. Audit `raceday.split_conflict_resolved`.
 */
export async function resolveConflict(
  entryId: number,
  actor: SessionUser,
): Promise<ConflictDecision> {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.splitEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.outcome !== "conflict" || entry.time === null) return "missing";
    const key = { bib_year_split: { bib: entry.bib, year: entry.year, split: entry.split } };
    const current = await tx.split.findUnique({ where: key, select: { time: true } });
    if (!conflictStillCurrent(entry.note, current)) return "stale";
    await tx.split.upsert({
      where: key,
      update: { time: entry.time, created: new Date(), author: entry.author },
      create: {
        bib: entry.bib,
        year: entry.year,
        split: entry.split,
        time: entry.time,
        created: new Date(),
        author: entry.author,
      },
    });
    await tx.splitEntry.updateMany({
      where: {
        year: entry.year,
        split: entry.split,
        bib: entry.bib,
        outcome: { in: OWNING_OUTCOMES },
      },
      data: { outcome: "replaced" },
    });
    await tx.splitEntry.update({
      where: { id: entry.id },
      data: { outcome: "resolved", note: `${entry.note ?? ""};by=${actor.id}`.slice(0, 255) },
    });
    await writeAudit(
      {
        actor,
        action: "raceday.split_conflict_resolved",
        target: `split:${entry.year}:${entry.split}:${entry.bib}`,
        detail: { entryId: entry.id, from: current?.time ?? null, to: entry.time },
      },
      tx,
    );
    return "ok";
  });
}

/** Admin: konflikt zamítnout (v mcvv_split zůstane původní hodnota). */
export async function dismissConflict(
  entryId: number,
  actor: SessionUser,
): Promise<ConflictDecision> {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.splitEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.outcome !== "conflict") return "missing";
    await tx.splitEntry.update({
      where: { id: entry.id },
      data: { outcome: "rejected", note: `dismissed;by=${actor.id}` },
    });
    await writeAudit(
      {
        actor,
        action: "raceday.split_conflict_dismissed",
        target: `split:${entry.year}:${entry.split}:${entry.bib}`,
        detail: { entryId: entry.id, rejected: entry.time },
      },
      tx,
    );
    return "ok";
  });
}

export async function raceDayOverview(year: number) {
  const [splitCounts, conflicts, recent] = await Promise.all([
    prisma.split.groupBy({ by: ["split"], where: { year }, _count: { _all: true } }),
    prisma.splitEntry.findMany({
      where: { year, outcome: "conflict" },
      orderBy: { receivedAt: "desc" },
      take: 100,
    }),
    prisma.splitEntry.findMany({ where: { year }, orderBy: { receivedAt: "desc" }, take: 30 }),
  ]);
  return {
    splitCounts: Object.fromEntries(splitCounts.map((row) => [row.split, row._count._all])),
    conflicts,
    recent,
  };
}
