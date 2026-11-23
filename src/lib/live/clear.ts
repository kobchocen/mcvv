import type { Prisma } from "@prisma/client";

import { writeAudit } from "@/lib/audit/log";
import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

import {
  clearsFinishRecords,
  formatClearSource,
  snapshotFinishBibs,
  snapshotFinishPunches,
  snapshotRows,
  splitRowKey,
  type ClearFilter,
} from "./clear-core";
import { OWNING_OUTCOMES } from "./ingest-core";
import { LIVE_ZERO_OVERRIDE_KEY } from "./race-context";

type Tx = Prisma.TransactionClient;

export type ClearCounts = {
  /** Řádky mcvv_split, které se smažou, podle splitu. */
  splits: Record<string, number>;
  splitsTotal: number;
  /** Záznamy deníku mcvv_split_entry, které se smažou. */
  entries: number;
  /** Z toho otevřené konflikty. */
  conflicts: number;
  /** Kliky stopek v cíli (mcvv_finish_punch), které se smažou (#366). */
  finishPunches: number;
  /** Čísla ze stanice čísel v cíli (mcvv_finish_bib), která se smažou (#366). */
  finishBibs: number;
};

/** Všechny záznamy stanic v cíli ročníku (i měkce smazané), když je výběr zahrnuje. */
function finishWhere(year: number, filter: ClearFilter): { year: number } | null {
  return clearsFinishRecords(filter) ? { year } : null;
}

function journalWhere(year: number, filter: ClearFilter): Prisma.SplitEntryWhereInput {
  const base: Prisma.SplitEntryWhereInput = { year, split: { in: filter.splits } };
  if (filter.source.kind === "source") return { ...base, source: filter.source.source };
  return base;
}

/**
 * Řádky mcvv_split ve výběru. Bez filtru zdroje všechny řádky splitů ročníku (i ty bez
 * zápisu v deníku); se zdrojem / klíčem jen řádky, které vlastní zápis toho zdroje
 * (stejné číslo, split a čas jako zápis se stavem applied / resolved).
 */
async function selectedSplitRows(db: Tx | typeof prisma, year: number, filter: ClearFilter) {
  const rows = await db.split.findMany({
    where: { year, split: { in: filter.splits } },
    select: { bib: true, split: true, time: true, author: true, created: true },
  });
  if (filter.source.kind === "all") return rows;
  const owners = await db.splitEntry.findMany({
    where: { ...journalWhere(year, filter), outcome: { in: OWNING_OUTCOMES } },
    select: { bib: true, split: true, time: true },
  });
  const owned = new Set(
    owners
      .filter((o): o is { bib: number; split: string; time: number } => o.time !== null)
      .map(splitRowKey),
  );
  return rows.filter((row) => owned.has(splitRowKey(row)));
}

function countBySplit(rows: { split: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.split] = (counts[row.split] ?? 0) + 1;
  return counts;
}

/** Náhled: kolik se toho smaže (stejný výběr jako `clearSplits`). */
export async function previewClear(year: number, filter: ClearFilter): Promise<ClearCounts> {
  const where = journalWhere(year, filter);
  const finish = finishWhere(year, filter);
  const [rows, entries, conflicts, finishPunches, finishBibs] = await Promise.all([
    selectedSplitRows(prisma, year, filter),
    prisma.splitEntry.count({ where }),
    prisma.splitEntry.count({ where: { ...where, outcome: "conflict" } }),
    finish ? prisma.finishPunch.count({ where: finish }) : 0,
    finish ? prisma.finishBib.count({ where: finish }) : 0,
  ]);
  return {
    splits: countBySplit(rows),
    splitsTotal: rows.length,
    entries,
    conflicts,
    finishPunches,
    finishBibs,
  };
}

export type ClearOptions = {
  /** Smazat zkušební nulu. */
  clearZeroOverride: boolean;
};

export type ClearResult = ClearCounts & { zeroCleared: boolean };

const DELETE_CHUNK = 200;

/**
 * Smaže výběr z mcvv_split i z deníku (včetně konfliktů) a s cílem a zdrojem „vše“ také
 * záznamy stanic v cíli (kliky stopek a čísla, #366) v jedné transakci a zapíše audit
 * `raceday.splits_cleared` se snímkem smazaných řádků.
 * Ochranu v den závodu (Q32) a potvrzení kontroluje volající (server action).
 */
export async function clearSplits(
  year: number,
  filter: ClearFilter,
  options: ClearOptions,
  actor: SessionUser,
): Promise<ClearResult> {
  return prisma.$transaction(
    async (tx) => {
      const rows = await selectedSplitRows(tx, year, filter);
      if (filter.source.kind === "all") {
        await tx.split.deleteMany({ where: { year, split: { in: filter.splits } } });
      } else {
        for (let i = 0; i < rows.length; i += DELETE_CHUNK) {
          const chunk = rows.slice(i, i + DELETE_CHUNK);
          await tx.split.deleteMany({
            where: {
              year,
              OR: chunk.map((row) => ({ bib: row.bib, split: row.split, time: row.time })),
            },
          });
        }
      }
      const where = journalWhere(year, filter);
      const conflicts = await tx.splitEntry.count({ where: { ...where, outcome: "conflict" } });
      const removed = await tx.splitEntry.deleteMany({ where });

      const finish = finishWhere(year, filter);
      const [punchRows, bibRows] = finish
        ? await Promise.all([
            tx.finishPunch.findMany({ where: finish }),
            tx.finishBib.findMany({ where: finish }),
          ])
        : [[], []];
      if (finish) {
        await tx.finishPunch.deleteMany({ where: finish });
        await tx.finishBib.deleteMany({ where: finish });
      }

      let zeroCleared = false;
      if (options.clearZeroOverride) {
        const deleted = await tx.setting.deleteMany({ where: { key: LIVE_ZERO_OVERRIDE_KEY } });
        zeroCleared = deleted.count > 0;
      }

      const counts = countBySplit(rows);
      await writeAudit(
        {
          actor,
          action: "raceday.splits_cleared",
          target: `year:${year}`,
          detail: {
            filter: { splits: filter.splits, source: formatClearSource(filter.source) },
            splits: counts,
            splitsTotal: rows.length,
            entries: removed.count,
            conflicts,
            zeroCleared,
            finishPunches: punchRows.length,
            finishBibs: bibRows.length,
            // [číslo, split, čas, autor, created] – podklad pro případnou obnovu
            snapshot: snapshotRows(rows),
            // #366: záznamy stanic v cíli – podklad pro případnou obnovu (formát viz clear-core)
            ...(finish
              ? {
                  finishPunchSnapshot: snapshotFinishPunches(punchRows),
                  finishBibSnapshot: snapshotFinishBibs(bibRows),
                }
              : {}),
          },
        },
        tx,
      );
      return {
        splits: counts,
        splitsTotal: rows.length,
        entries: removed.count,
        conflicts,
        finishPunches: punchRows.length,
        finishBibs: bibRows.length,
        zeroCleared,
      };
    },
    { timeout: 60_000 },
  );
}
