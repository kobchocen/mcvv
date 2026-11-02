/**
 * Číselník běžců v administraci (#198) – dotazy pro hledání a detail běžce.
 */
import { Prisma } from "@prisma/client";

import {
  buildRunnerYears,
  previousRunnerNames,
  RUNNER_SEARCH_LIMIT,
  runnerSearchPattern,
  type RunnerYearRow,
} from "@/lib/admin/runner-directory-core";
import { prisma } from "@/lib/db/client";

export type RunnerSearchHit = {
  id: string;
  name: string;
  years: number[];
  previousNames: string[];
};

/**
 * Hledá podle jména, id nebo dřívějšího jména (bezec_name ve výsledcích / startovkách).
 * Kolace utf8mb4_unicode_ci = bez ohledu na diakritiku a velikost písmen.
 */
export async function searchRunners(
  query: string,
): Promise<{ hits: RunnerSearchHit[]; more: boolean } | null> {
  const pattern = runnerSearchPattern(query);
  if (!pattern) return null;
  const rows = await prisma.$queryRaw<{ id: string; jmeno: string }[]>(Prisma.sql`
    SELECT b.id, b.jmeno FROM cis_bezec b
    WHERE b.jmeno LIKE ${pattern} OR b.id LIKE ${pattern}
       OR EXISTS (SELECT 1 FROM mcvv_time t WHERE t.bezec_id = b.id AND t.bezec_name LIKE ${pattern})
       OR EXISTS (SELECT 1 FROM mcvv_start s WHERE s.bezec_id = b.id AND s.bezec_name LIKE ${pattern})
    ORDER BY b.jmeno, b.id
    LIMIT ${RUNNER_SEARCH_LIMIT + 1}`);
  const page = rows.slice(0, RUNNER_SEARCH_LIMIT);
  const ids = page.map((row) => row.id);
  const [results, starts, lines] = ids.length
    ? await Promise.all([
        prisma.result.findMany({
          where: { runnerId: { in: ids } },
          select: { runnerId: true, year: true, runnerName: true },
        }),
        prisma.startEntry.findMany({
          where: { runnerId: { in: ids } },
          select: { runnerId: true, year: true, runnerName: true },
        }),
        prisma.registrationLine.findMany({
          where: { runnerId: { in: ids } },
          select: { runnerId: true, year: true },
        }),
      ])
    : [[], [], []];
  const hits = page.map((row) => {
    const mine = <T extends { runnerId: string }>(list: T[]) =>
      list.filter((item) => item.runnerId === row.id);
    const years = new Set([...mine(results), ...mine(starts), ...mine(lines)].map((r) => r.year));
    return {
      id: row.id,
      name: row.jmeno,
      years: [...years].sort((a, b) => b - a),
      previousNames: previousRunnerNames(
        row.jmeno,
        [...mine(results), ...mine(starts)]
          .sort((a, b) => b.year - a.year)
          .map((r) => r.runnerName),
      ),
    };
  });
  return { hits, more: rows.length > RUNNER_SEARCH_LIMIT };
}

export type RunnerDetail = {
  id: string;
  name: string;
  nationality: string | null;
  years: RunnerYearRow[];
  previousNames: string[];
};

export async function loadRunnerDetail(id: string): Promise<RunnerDetail | null> {
  const runner = await prisma.runner.findUnique({
    where: { id },
    select: { id: true, name: true, nationality: true },
  });
  if (!runner) return null;
  const [results, starts, lines] = await Promise.all([
    prisma.result.findMany({
      where: { runnerId: id },
      select: { year: true, runnerName: true, clubId: true },
    }),
    prisma.startEntry.findMany({
      where: { runnerId: id },
      select: { year: true, runnerName: true, clubId: true },
    }),
    prisma.registrationLine.findMany({
      where: { runnerId: id },
      select: { year: true, registrationId: true, clubId: true },
    }),
  ]);
  const years = buildRunnerYears({ results, starts, lines });
  return {
    ...runner,
    years,
    previousNames: previousRunnerNames(
      runner.name,
      years.flatMap((row) => [row.resultName, row.startName]),
    ),
  };
}
