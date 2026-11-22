import { prisma } from "@/lib/db/client";
import { FINISH_SPLIT } from "@/lib/live/stations";
import { yearStartEntries } from "@/lib/race/roster";

import type { TombolaEntrant } from "./tombola-core";
import { PUBLIC_YEAR_WHERE } from "@/lib/testmode/public-year";

export type TombolaPool = { source: "results" | "splits" | "none"; entrants: TombolaEntrant[] };

/** Ročníky, ze kterých lze losovat (mají výsledky nebo cílové průchody), nejnovější první. */
export async function tombolaYears(): Promise<number[]> {
  const [results, splits] = await Promise.all([
    prisma.result.groupBy({ by: ["year"], where: { year: PUBLIC_YEAR_WHERE } }),
    prisma.split.groupBy({ by: ["year"], where: { split: FINISH_SPLIT, year: PUBLIC_YEAR_WHERE } }),
  ]);
  return [...new Set([...results, ...splits].map((row) => row.year))].sort((a, b) => b - a);
}

/**
 * Doběhnuvší ročníku: po zveřejnění výsledků `mcvv_time` (čas > 0), jinak čísla s průchodem
 * cílem (`mcvv_split`, split 9) dohledaná ve startovce (`yearStartEntries`).
 */
export async function loadTombolaPool(year: number): Promise<TombolaPool> {
  const results = await prisma.result.findMany({
    where: { year, time: { gt: 0 } },
    select: {
      runnerId: true,
      runnerName: true,
      clubId: true,
      clubName: true,
      runner: { select: { name: true } },
      club: { select: { name: true } },
    },
  });
  if (results.length > 0) {
    return {
      source: "results",
      entrants: results.map((row) => ({
        runnerId: row.runnerId,
        name: row.runner?.name || row.runnerName || row.runnerId,
        clubId: row.clubId,
        club: row.club?.name || row.clubName || row.clubId,
      })),
    };
  }
  const finished = await prisma.split.findMany({
    where: { year, split: FINISH_SPLIT, time: { gt: 0 } },
    select: { bib: true },
  });
  if (finished.length === 0) return { source: "none", entrants: [] };
  const start = await yearStartEntries(
    year,
    finished.map((row) => row.bib),
  );
  return {
    source: "splits",
    entrants: start.map((row) => ({
      runnerId: row.runnerId,
      name: row.runnerName,
      clubId: row.clubId,
      club: row.clubName,
    })),
  };
}
