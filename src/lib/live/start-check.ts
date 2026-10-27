import { Prisma } from "@prisma/client";

import { writeAudit } from "@/lib/audit/log";
import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

import type { WebEntry } from "./ingest-core";
import type { EntryResult } from "./ingest";
import type { RaceContext } from "./race-context";
import {
  buildStartOverview,
  checkStartPunch,
  decideStartWrite,
  expectedMatches,
  ownsStart,
  snapshotStarts,
  START_MANUAL_SOURCE,
  START_OWNING,
  START_WEB_SOURCE,
  startOffsetSeconds,
  type StartOutcome,
} from "./start-check-core";

/**
 * Evidence startu (#203) – zápis a přehled. Jen tabulky `mcvv_start_check` (aktuální stav
 * čísla) a `mcvv_start_check_entry` (deník). `mcvv_split`, výsledky, OFeed ani OBD se nemění.
 */

type Tx = Prisma.TransactionClient;
type Ctx = Pick<RaceContext, "year" | "zero" | "intervalS">;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

type JournalRow = {
  entryKey: string;
  outcome: string;
  bib: number;
  offsetS: number | null;
  note: string | null;
};

function storedResult(row: JournalRow): EntryResult {
  return {
    id: row.entryKey,
    outcome: row.outcome as EntryResult["outcome"],
    bib: row.bib,
    time: row.offsetS,
    note: row.note ?? undefined,
  };
}

async function knownBib(tx: Tx, year: number, bib: number): Promise<boolean> {
  const row = await tx.startEntry.findFirst({ where: { year, bib }, select: { bib: true } });
  return row !== null;
}

/** Smaže řádek startu, jen když ho daný zápis opravdu vlastní (stejné číslo i čas). */
async function releaseOwnedStart(
  tx: Tx,
  entry: { year: number; bib: number; startedAt: Date | null; outcome: string },
): Promise<void> {
  const row = await tx.startCheck.findUnique({
    where: { year_bib: { year: entry.year, bib: entry.bib } },
  });
  if (!ownsStart(entry, row)) return;
  await tx.startCheck.deleteMany({
    where: { year: entry.year, bib: entry.bib, startedAt: entry.startedAt! },
  });
}

async function applyStartEntry(
  tx: Tx,
  entry: WebEntry,
  ctx: Ctx,
  user: { id: number },
  now: Date,
): Promise<EntryResult> {
  const previous = await tx.startCheckEntry.findUnique({ where: { entryKey: entry.id } });
  if (previous) return storedResult(previous);
  const base = {
    entryKey: entry.id,
    year: ctx.year,
    source: START_WEB_SOURCE,
    action: entry.action,
    userId: user.id,
  };

  let original: Awaited<ReturnType<typeof tx.startCheckEntry.findUnique>> = null;
  if (entry.action !== "create") {
    original = await tx.startCheckEntry.findUnique({ where: { entryKey: entry.replaces } });
    if (!original || original.year !== ctx.year) {
      const row = await tx.startCheckEntry.create({
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
    await releaseOwnedStart(tx, original);
    await tx.startCheckEntry.update({
      where: { id: original.id },
      data: { outcome: entry.action === "delete" ? "deleted" : "replaced" },
    });
    if (entry.action === "delete") {
      const row = await tx.startCheckEntry.create({
        data: {
          ...base,
          bib: original.bib,
          startedAt: original.startedAt,
          offsetS: original.offsetS,
          replaces: entry.replaces,
          outcome: "deleted",
        },
      });
      return storedResult(row);
    }
  }

  const startedAt = new Date(entry.punchedAt);
  const check = checkStartPunch(entry.punchedAt, now);
  if (!check.ok) {
    const row = await tx.startCheckEntry.create({
      data: {
        ...base,
        bib: entry.bib,
        startedAt,
        replaces: original?.entryKey ?? null,
        outcome: "rejected",
        note: check.reason,
      },
    });
    return storedResult(row);
  }
  const offsetS = startOffsetSeconds(startedAt, ctx.zero, entry.bib, ctx.intervalS);
  const existing = await tx.startCheck.findUnique({
    where: { year_bib: { year: ctx.year, bib: entry.bib } },
  });
  let outcome: StartOutcome;
  let existingOffset: number | undefined;
  if (decideStartWrite(existing) === "insert") {
    await tx.startCheck.create({
      data: {
        year: ctx.year,
        bib: entry.bib,
        startedAt,
        source: START_WEB_SOURCE,
        userId: user.id,
      },
    });
    outcome = "applied";
  } else {
    outcome = "duplicate";
    existingOffset = startOffsetSeconds(existing!.startedAt, ctx.zero, entry.bib, ctx.intervalS);
  }
  const notes = [
    (await knownBib(tx, ctx.year, entry.bib)) ? null : "unknown-bib",
    existing ? `existing=${existing.startedAt.toISOString()}` : null,
  ].filter(Boolean);
  const row = await tx.startCheckEntry.create({
    data: {
      ...base,
      bib: entry.bib,
      startedAt,
      offsetS,
      replaces: original?.entryKey ?? null,
      outcome,
      note: notes.length > 0 ? notes.join(";") : null,
    },
  });
  return { ...storedResult(row), existingTime: existingOffset };
}

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

/** Dávka zápisů ze stanoviště Start (webový klient splitmakera). Idempotentní podle `id`. */
export async function applyStartEntries(
  entries: WebEntry[],
  ctx: Ctx,
  user: { id: number },
  now = new Date(),
): Promise<EntryResult[]> {
  const results: EntryResult[] = [];
  for (const entry of entries) {
    results.push(
      await withRetry(entry.id, () =>
        prisma.$transaction((tx) => applyStartEntry(tx, entry, ctx, user, now)),
      ),
    );
  }
  return results;
}

/** Start účtu není přiřazený: nic se nezapíše, do deníku `rejected` (idempotentní podle `id`). */
export async function rejectStartEntries(
  entries: WebEntry[],
  ctx: Ctx,
  user: { id: number },
  note: string,
): Promise<EntryResult[]> {
  const results: EntryResult[] = [];
  for (const entry of entries) {
    results.push(
      await withRetry(entry.id, async () => {
        const previous = await prisma.startCheckEntry.findUnique({
          where: { entryKey: entry.id },
        });
        if (previous) return storedResult(previous);
        const row = await prisma.startCheckEntry.create({
          data: {
            entryKey: entry.id,
            year: ctx.year,
            bib: entry.action === "delete" ? 0 : entry.bib,
            startedAt: entry.action === "delete" ? null : new Date(entry.punchedAt),
            source: START_WEB_SOURCE,
            action: entry.action,
            replaces: entry.action === "create" ? null : entry.replaces,
            outcome: "rejected",
            note,
            userId: user.id,
          },
        });
        return storedResult(row);
      }),
    );
  }
  return results;
}

/** Přehled pro admina a pořadatele: startovka × záznamy startu + kdo zapsal. */
export async function loadStartOverview(ctx: Ctx) {
  const [startList, records, journalCount] = await Promise.all([
    prisma.startEntry.findMany({
      where: { year: ctx.year },
      select: {
        bib: true,
        runnerName: true,
        clubName: true,
        categoryId: true,
        runner: { select: { name: true } },
      },
    }),
    prisma.startCheck.findMany({ where: { year: ctx.year } }),
    prisma.startCheckEntry.count({ where: { year: ctx.year } }),
  ]);
  const userIds = [...new Set(records.map((r) => r.userId).filter((id): id is number => !!id))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const overview = buildStartOverview(
    startList.map((row) => ({
      bib: row.bib,
      name: row.runnerName ?? row.runner?.name ?? null,
      club: row.clubName,
      categoryId: row.categoryId,
    })),
    records,
    ctx,
  );
  return {
    ...overview,
    journalCount,
    userNames: Object.fromEntries(users.map((u) => [u.id, u.name])) as Record<number, string>,
  };
}

export async function startJournal(year: number, bib?: number) {
  return prisma.startCheckEntry.findMany({
    where: bib ? { year, bib } : { year },
    orderBy: { id: "desc" },
    take: bib ? 30 : 40,
  });
}

export type ManualStartResult =
  | { ok: true; action: "create" | "correct" | "delete" | "unchanged" }
  | { ok: false; reason: "changed" | "reason" | "missing" };

/**
 * Ruční zápis / oprava startu adminem (jen admin, jde i v den závodu – jednotlivá oprava).
 * Ochrana proti souběhu: `expected` = stav, který admin viděl (ms epoch nebo null).
 */
export async function setManualStart(input: {
  ctx: Ctx;
  bib: number;
  startedAt: Date;
  expected: number | null;
  reason: string;
  actor: SessionUser;
}): Promise<ManualStartResult> {
  const { ctx, bib, startedAt, expected, reason, actor } = input;
  return prisma.$transaction(async (tx) => {
    const current = await tx.startCheck.findUnique({
      where: { year_bib: { year: ctx.year, bib } },
    });
    if (!expectedMatches(expected, current)) return { ok: false, reason: "changed" };
    if (current && !reason) return { ok: false, reason: "reason" };
    if (current && current.startedAt.getTime() === startedAt.getTime()) {
      return { ok: true, action: "unchanged" };
    }
    if (current) {
      await tx.startCheck.update({
        where: { year_bib: { year: ctx.year, bib } },
        data: { startedAt, source: START_MANUAL_SOURCE, userId: actor.id },
      });
    } else {
      await tx.startCheck.create({
        data: { year: ctx.year, bib, startedAt, source: START_MANUAL_SOURCE, userId: actor.id },
      });
    }
    await tx.startCheckEntry.updateMany({
      where: { year: ctx.year, bib, outcome: { in: START_OWNING } },
      data: { outcome: "replaced" },
    });
    const action = current ? "correct" : "create";
    await tx.startCheckEntry.create({
      data: {
        entryKey: `adm:${actor.id}:${Date.now()}:${bib}`,
        year: ctx.year,
        bib,
        startedAt,
        offsetS: startOffsetSeconds(startedAt, ctx.zero, bib, ctx.intervalS),
        source: START_MANUAL_SOURCE,
        action,
        outcome: "applied",
        note: reason || null,
        userId: actor.id,
      },
    });
    await writeAudit(
      {
        actor,
        action: "raceday.start_set",
        target: `start:${ctx.year}:${bib}`,
        detail: {
          from: current?.startedAt.toISOString() ?? null,
          to: startedAt.toISOString(),
          reason: reason || null,
        },
      },
      tx,
    );
    return { ok: true, action };
  });
}

/** Ruční smazání záznamu startu (jen admin, důvod povinný). */
export async function deleteManualStart(input: {
  ctx: Ctx;
  bib: number;
  expected: number | null;
  reason: string;
  actor: SessionUser;
}): Promise<ManualStartResult> {
  const { ctx, bib, expected, reason, actor } = input;
  if (!reason) return { ok: false, reason: "reason" };
  return prisma.$transaction(async (tx) => {
    const current = await tx.startCheck.findUnique({
      where: { year_bib: { year: ctx.year, bib } },
    });
    if (!current) return { ok: false, reason: "missing" };
    if (!expectedMatches(expected, current)) return { ok: false, reason: "changed" };
    await tx.startCheck.delete({ where: { year_bib: { year: ctx.year, bib } } });
    await tx.startCheckEntry.updateMany({
      where: { year: ctx.year, bib, outcome: { in: START_OWNING } },
      data: { outcome: "deleted" },
    });
    await tx.startCheckEntry.create({
      data: {
        entryKey: `adm:${actor.id}:${Date.now()}:${bib}:del`,
        year: ctx.year,
        bib,
        startedAt: current.startedAt,
        source: START_MANUAL_SOURCE,
        action: "delete",
        outcome: "deleted",
        note: reason,
        userId: actor.id,
      },
    });
    await writeAudit(
      {
        actor,
        action: "raceday.start_deleted",
        target: `start:${ctx.year}:${bib}`,
        detail: { from: current.startedAt.toISOString(), source: current.source, reason },
      },
      tx,
    );
    return { ok: true, action: "delete" };
  });
}

export async function previewStartClear(year: number) {
  const [records, entries] = await Promise.all([
    prisma.startCheck.count({ where: { year } }),
    prisma.startCheckEntry.count({ where: { year } }),
  ]);
  return { records, entries };
}

/**
 * Hromadné vyčištění evidence startu ročníku (stejná pravidla jako mezičasy: jen admin,
 * zakázané od skutečné nuly ročníku – kontroluje volající). Audit se snímkem smazaných řádků.
 */
export async function clearStarts(year: number, actor: SessionUser) {
  return prisma.$transaction(
    async (tx) => {
      const records = await tx.startCheck.findMany({ where: { year } });
      await tx.startCheck.deleteMany({ where: { year } });
      const removed = await tx.startCheckEntry.deleteMany({ where: { year } });
      await writeAudit(
        {
          actor,
          action: "raceday.starts_cleared",
          target: `year:${year}`,
          detail: {
            records: records.length,
            entries: removed.count,
            // [číslo, start ISO, zdroj] – podklad pro případnou obnovu
            snapshot: snapshotStarts(records),
          },
        },
        tx,
      );
      return { records: records.length, entries: removed.count };
    },
    { timeout: 60_000 },
  );
}
