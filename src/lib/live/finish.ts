import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { writeAudit, type AuditActor } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { loadRoster } from "@/lib/race/roster";

import {
  checkStamp,
  FINISH_AUTHOR,
  FINISH_SOURCE,
  FINISH_SPLIT_CODE,
  markKept,
  pairFinish,
  planFinishSync,
  sortKeyBetween,
  summarizePairs,
  writablePairs,
  type FinishBibRow,
  type FinishOp,
  type FinishOpResult,
  type FinishPair,
  type FinishPunchRow,
  type FinishSyncPlan,
} from "./finish-core";
import { OWNING_OUTCOMES } from "./ingest-core";
import type { RaceContext } from "./race-context";
import { startInstant } from "./start-time";
import { autoMarkStart } from "./starter";

/**
 * Cíl (#252) – DB vrstva: zápisy stanic (stopky, čísla), párování, zápis cílových časů do
 * `mcvv_split` (split 9, autor `cil`) a ruční opravy párování. Online výsledky, tabule
 * i speaker čtou cílové časy z `mcvv_split`, takže se napojí bez další změny.
 */

type Tx = Prisma.TransactionClient;
export type FinishPlan = Pick<RaceContext, "year" | "zero" | "intervalS" | "secondStartFrom">;
type Actor = AuditActor & { id: number | null };

const SYNC_LOCK = "mcvv_finish_sync";
/** Klik ani číslo nemůže být dřív než nula závodu (zbytky testu z dřívějška se ignorují). */
const BEFORE_ZERO_MS = 10 * 60_000;

function finishWindow(plan: FinishPlan) {
  return { gte: new Date(plan.zero.getTime() - BEFORE_ZERO_MS) };
}

function punchRow(row: {
  id: number;
  entryKey: string;
  punchedAt: Date;
  deleted: boolean;
  source: string;
}): FinishPunchRow {
  return { ...row, punchedAt: row.punchedAt.getTime() };
}

function bibRow(row: {
  id: number;
  entryKey: string;
  bib: number;
  readAt: Date;
  sortKey: number;
  deleted: boolean;
  source: string;
}): FinishBibRow {
  return { ...row, readAt: row.readAt.getTime() };
}

/** Zápisy ze stanic (offline fronta). Idempotentní podle `id`; po dávce se přepočítá cíl. */
export async function applyFinishOps(
  ops: readonly FinishOp[],
  plan: FinishPlan,
  user: Actor,
  now = new Date(),
): Promise<FinishOpResult[]> {
  const results: FinishOpResult[] = [];
  for (const op of ops) results.push(await applyOne(op, plan.year, user, now));
  if (results.some((result) => result.outcome === "applied")) await syncFinish(plan, user, now);
  return results;
}

async function applyOne(
  op: FinishOp,
  year: number,
  user: Actor,
  now: Date,
): Promise<FinishOpResult> {
  if (op.kind === "delete") {
    const [punch, bib] = await Promise.all([
      prisma.finishPunch.findUnique({ where: { entryKey: op.target } }),
      prisma.finishBib.findUnique({ where: { entryKey: op.target } }),
    ]);
    const row = punch ?? bib;
    if (!row || row.year !== year) return { id: op.id, outcome: "missing" };
    if (row.deleted) return { id: op.id, outcome: "duplicate" };
    const data = { deleted: true, note: `smazano-stanici;op=${op.id}`.slice(0, 255) };
    if (punch) await prisma.finishPunch.update({ where: { id: punch.id }, data });
    else await prisma.finishBib.update({ where: { id: bib!.id }, data });
    return { id: op.id, outcome: "applied" };
  }
  const stamp = checkStamp(op.at, now.getTime());
  if (stamp !== "ok") return { id: op.id, outcome: "rejected", note: stamp };
  try {
    if (op.kind === "punch") {
      const exists = await prisma.finishPunch.findUnique({ where: { entryKey: op.id } });
      if (exists) return { id: op.id, outcome: "duplicate" };
      await prisma.finishPunch.create({
        data: {
          entryKey: op.id,
          year,
          punchedAt: new Date(op.at),
          source: "watch",
          userId: user.id,
        },
      });
    } else {
      const exists = await prisma.finishBib.findUnique({ where: { entryKey: op.id } });
      if (exists) return { id: op.id, outcome: "duplicate" };
      await prisma.finishBib.create({
        data: {
          entryKey: op.id,
          year,
          bib: op.bib,
          readAt: new Date(op.at),
          sortKey: op.at,
          source: "bibs",
          userId: user.id,
        },
      });
    }
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { id: op.id, outcome: "duplicate" };
    throw error;
  }
  return { id: op.id, outcome: "applied" };
}

/** Plánovaný start čísla ze startovky (jen zaplacené přihlášky). */
async function startLookup(db: Tx | typeof prisma, plan: FinishPlan) {
  const roster = await loadRoster(plan.year, { db });
  const byBib = new Map(roster.map((row) => [row.bib, row]));
  return {
    roster: byBib,
    startOf: (bib: number) =>
      byBib.has(bib)
        ? startInstant(plan.zero, bib, plan.intervalS, plan.secondStartFrom).getTime()
        : null,
  };
}

export type FinishState = {
  pairs: FinishPair[];
  names: Map<number, { name: string; categoryId: string }>;
  summary: ReturnType<typeof summarizePairs>;
  deletedPunches: FinishPunchRow[];
  deletedBibs: FinishBibRow[];
};

/** Stav párování pro přehled v administraci. */
export async function loadFinishState(plan: FinishPlan): Promise<FinishState> {
  const [punches, bibs, existing, lookup] = await Promise.all([
    prisma.finishPunch.findMany({ where: { year: plan.year, punchedAt: finishWindow(plan) } }),
    prisma.finishBib.findMany({ where: { year: plan.year, readAt: finishWindow(plan) } }),
    prisma.split.findMany({
      where: { year: plan.year, split: FINISH_SPLIT_CODE },
      select: { bib: true, time: true, author: true },
    }),
    startLookup(prisma, plan),
  ]);
  const pRows = punches.map(punchRow);
  const bRows = bibs.map(bibRow);
  const raw = pairFinish(pRows, bRows, lookup.startOf);
  const sync = planFinishSync(writablePairs(raw), existing);
  const pairs = markKept(raw, sync.kept);
  const names = new Map(
    [...lookup.roster].map(([bib, row]) => [
      bib,
      { name: row.runnerName, categoryId: row.categoryId },
    ]),
  );
  return {
    pairs,
    names,
    summary: summarizePairs(pairs),
    deletedPunches: pRows.filter((row) => row.deleted),
    deletedBibs: bRows.filter((row) => row.deleted),
  };
}

/**
 * Přepočet cíle: párování → `mcvv_split` (split 9). Pod zámkem, aby se dvě dávky
 * nepřepisovaly. Ruční časy admina (záloha) párování nepřepíše.
 */
export async function syncFinish(
  plan: FinishPlan,
  actor: Actor,
  now = new Date(),
): Promise<FinishSyncPlan> {
  return prisma.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<{ ok: bigint | number | null }[]>`
        SELECT GET_LOCK(${SYNC_LOCK}, 10) AS ok`;
      if (Number(lock[0]?.ok ?? 0) !== 1) throw new Error("finish sync busy");
      try {
        return await syncInTx(tx, plan, actor, now);
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK(${SYNC_LOCK})`;
      }
    },
    { timeout: 30_000 },
  );
}

async function syncInTx(
  tx: Tx,
  plan: FinishPlan,
  actor: Actor,
  now: Date,
): Promise<FinishSyncPlan> {
  const year = plan.year;
  const [punches, bibs, existing, lookup] = await Promise.all([
    tx.finishPunch.findMany({ where: { year, punchedAt: finishWindow(plan) } }),
    tx.finishBib.findMany({ where: { year, readAt: finishWindow(plan) } }),
    tx.split.findMany({
      where: { year, split: FINISH_SPLIT_CODE },
      select: { bib: true, time: true, author: true },
    }),
    startLookup(tx, plan),
  ]);
  const pairs = pairFinish(punches.map(punchRow), bibs.map(bibRow), lookup.startOf);
  const sync = planFinishSync(writablePairs(pairs), existing);
  const base = { year, split: FINISH_SPLIT_CODE };
  const entry = (bib: number, time: number | null, action: string, outcome: string) => ({
    entryKey: `cil:${randomUUID()}`,
    ...base,
    bib,
    time,
    source: FINISH_SOURCE,
    action,
    outcome,
    author: FINISH_AUTHOR,
    userId: actor.id,
    receivedAt: now,
  });
  for (const row of sync.insert) {
    await tx.split.create({
      data: { ...base, bib: row.bib, time: row.time, created: now, author: FINISH_AUTHOR },
    });
    await tx.splitEntry.create({ data: entry(row.bib, row.time, "create", "applied") });
    await autoMarkStart(
      tx,
      { year, bib: row.bib, split: FINISH_SPLIT_CODE, splitAt: now, userId: actor.id },
      plan,
    );
  }
  for (const row of sync.update) {
    await tx.split.update({
      where: { bib_year_split: { ...base, bib: row.bib } },
      data: { time: row.time, created: now, author: FINISH_AUTHOR },
    });
    await tx.splitEntry.updateMany({
      where: { ...base, bib: row.bib, outcome: { in: OWNING_OUTCOMES } },
      data: { outcome: "replaced" },
    });
    await tx.splitEntry.create({ data: entry(row.bib, row.time, "correct", "applied") });
  }
  for (const row of sync.remove) {
    await tx.split.delete({ where: { bib_year_split: { ...base, bib: row.bib } } });
    await tx.splitEntry.updateMany({
      where: { ...base, bib: row.bib, outcome: { in: OWNING_OUTCOMES } },
      data: { outcome: "deleted" },
    });
    await tx.splitEntry.create({ data: entry(row.bib, null, "delete", "deleted") });
  }
  if (sync.insert.length + sync.update.length + sync.remove.length > 0) {
    await writeAudit(
      {
        actor,
        action: "raceday.finish_sync",
        target: `year:${year}`,
        detail: {
          inserted: sync.insert.length,
          updated: sync.update,
          removed: sync.remove,
          kept: sync.kept,
        },
        meta: { year, entity: "finish", source: "system" },
      },
      tx,
    );
  }
  return sync;
}

// ---------------------------------------------------------------------------
// Ruční opravy párování (admin / Měření). Každá oprava → audit a přepočet cíle.

export type FinishCorrection =
  | { kind: "delete-punch"; id: number; deleted: boolean }
  | { kind: "delete-bib"; id: number; deleted: boolean }
  | { kind: "swap-bibs"; id: number; otherId: number }
  | { kind: "insert-bib"; bib: number; beforeId: number | null }
  | { kind: "change-bib"; id: number; bib: number }
  | { kind: "insert-punch"; at: Date };

export type CorrectionResult = "ok" | "missing";

export async function correctFinish(
  plan: FinishPlan,
  correction: FinishCorrection,
  actor: Actor,
  now = new Date(),
): Promise<CorrectionResult> {
  const year = plan.year;
  const note = `admin:${actor.id ?? "-"}`;
  let detail: Prisma.InputJsonValue = { ...correction, at: undefined } as never;
  switch (correction.kind) {
    case "delete-punch": {
      const changed = await prisma.finishPunch.updateMany({
        where: { id: correction.id, year },
        data: { deleted: correction.deleted, note },
      });
      if (changed.count !== 1) return "missing";
      break;
    }
    case "delete-bib": {
      const changed = await prisma.finishBib.updateMany({
        where: { id: correction.id, year },
        data: { deleted: correction.deleted, note },
      });
      if (changed.count !== 1) return "missing";
      break;
    }
    case "change-bib": {
      const row = await prisma.finishBib.findFirst({ where: { id: correction.id, year } });
      if (!row) return "missing";
      await prisma.finishBib.update({
        where: { id: row.id },
        data: { bib: correction.bib, note },
      });
      detail = { kind: correction.kind, id: row.id, from: row.bib, to: correction.bib };
      break;
    }
    case "swap-bibs": {
      const [a, b] = await Promise.all([
        prisma.finishBib.findFirst({ where: { id: correction.id, year } }),
        prisma.finishBib.findFirst({ where: { id: correction.otherId, year } }),
      ]);
      if (!a || !b) return "missing";
      await prisma.$transaction([
        prisma.finishBib.update({ where: { id: a.id }, data: { sortKey: b.sortKey, note } }),
        prisma.finishBib.update({ where: { id: b.id }, data: { sortKey: a.sortKey, note } }),
      ]);
      detail = { kind: correction.kind, bibs: [a.bib, b.bib] };
      break;
    }
    case "insert-bib": {
      const active = await prisma.finishBib.findMany({
        where: { year, deleted: false, readAt: finishWindow(plan) },
        orderBy: [{ sortKey: "asc" }, { id: "asc" }],
        select: { id: true, sortKey: true },
      });
      let before: number | null = null;
      let after: number | null = null;
      if (correction.beforeId === null) {
        before = active.at(-1)?.sortKey ?? null;
      } else {
        const index = active.findIndex((row) => row.id === correction.beforeId);
        if (index < 0) return "missing";
        after = active[index].sortKey;
        before = index > 0 ? active[index - 1].sortKey : null;
      }
      const sortKey = sortKeyBetween(before, after ?? (before === null ? now.getTime() : null));
      await prisma.finishBib.create({
        data: {
          entryKey: `adm:${randomUUID()}`,
          year,
          bib: correction.bib,
          readAt: now,
          sortKey,
          source: "admin",
          userId: actor.id,
          note,
        },
      });
      break;
    }
    case "insert-punch": {
      await prisma.finishPunch.create({
        data: {
          entryKey: `adm:${randomUUID()}`,
          year,
          punchedAt: correction.at,
          source: "admin",
          userId: actor.id,
          note,
        },
      });
      detail = { kind: correction.kind, at: correction.at.toISOString() };
      break;
    }
  }
  await writeAudit({
    actor,
    action: "raceday.finish_correction",
    target: `year:${year}`,
    detail,
    meta: { year, entity: "finish", source: "web" },
  });
  await syncFinish(plan, actor, now);
  return "ok";
}
