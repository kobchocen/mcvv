/**
 * Číselník běžců v administraci (#198) – dotazy pro hledání a detail běžce.
 */
import { Prisma } from "@prisma/client";

import {
  buildRunnerYears,
  previousRunnerNames,
  RUNNER_SEARCH_LIMIT,
  RUNNER_SUGGEST_LIMIT,
  runnerSearchTerms,
  type RunnerSearchTerms,
  type RunnerYearRow,
} from "@/lib/admin/runner-directory-core";
import { prisma } from "@/lib/db/client";

export type RunnerSearchHit = {
  id: string;
  name: string;
  nationality: string | null;
  years: number[];
  previousNames: string[];
};

/**
 * Podmínka hledání: každé slovo musí sedět na jméno, id nebo dřívější jméno (bezec_name ve
 * výsledcích / startovkách), ročník narození = začátek id. Kolace utf8mb4_unicode_ci =
 * bez ohledu na diakritiku a velikost písmen.
 */
function runnerSearchWhere(terms: RunnerSearchTerms): Prisma.Sql {
  const parts = terms.words.map(
    (pattern) => Prisma.sql`(b.jmeno LIKE ${pattern} OR b.id LIKE ${pattern}
       OR EXISTS (SELECT 1 FROM mcvv_time t WHERE t.bezec_id = b.id AND t.bezec_name LIKE ${pattern})
       OR EXISTS (SELECT 1 FROM mcvv_start s WHERE s.bezec_id = b.id AND s.bezec_name LIKE ${pattern}))`,
  );
  if (terms.birthYear !== null) {
    parts.push(Prisma.sql`b.id LIKE ${`${terms.birthYear}%`}`);
  }
  return Prisma.join(parts, " AND ");
}

/** Hledá podle jména, id, dřívějšího jména a ročníku narození (např. „Novák 1980“). */
export async function searchRunners(
  query: string,
): Promise<{ hits: RunnerSearchHit[]; more: boolean } | null> {
  const terms = runnerSearchTerms(query);
  if (!terms) return null;
  const rows = await prisma.$queryRaw<
    { id: string; jmeno: string; statni_prislusnost: string | null }[]
  >(Prisma.sql`
    SELECT b.id, b.jmeno, b.statni_prislusnost FROM cis_bezec b
    WHERE ${runnerSearchWhere(terms)}
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
      nationality: row.statni_prislusnost,
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

export type RunnerSuggestion = {
  id: string;
  name: string;
  /** Ročník narození (první 4 číslice id). */
  born: string;
  nationality: string | null;
  /** Klub z posledního ročníku (výsledky, jinak startovka). */
  club: string | null;
  lastYear: number | null;
};

/** Návrhy pro našeptávač v číselníku běžců (jméno, id, dřívější jméno, ročník narození). */
export async function suggestRunners(query: string): Promise<RunnerSuggestion[]> {
  const terms = runnerSearchTerms(query);
  if (!terms) return [];
  const rows = await prisma.$queryRaw<
    {
      id: string;
      jmeno: string;
      statni_prislusnost: string | null;
      club: string | null;
      last_year: number | bigint | null;
    }[]
  >(Prisma.sql`
    SELECT b.id, b.jmeno, b.statni_prislusnost,
      COALESCE(
        (SELECT COALESCE(NULLIF(t.klub_name, ''), k.jmeno) FROM mcvv_time t
           LEFT JOIN cis_klub k ON k.id = t.klub_id AND k.rok = t.rok
          WHERE t.bezec_id = b.id ORDER BY t.rok DESC LIMIT 1),
        (SELECT COALESCE(NULLIF(s.klub_name, ''), k.jmeno) FROM mcvv_start s
           LEFT JOIN cis_klub k ON k.id = s.klub_id AND k.rok = s.rok
          WHERE s.bezec_id = b.id ORDER BY s.rok DESC LIMIT 1)
      ) AS club,
      GREATEST(
        COALESCE((SELECT MAX(t.rok) FROM mcvv_time t WHERE t.bezec_id = b.id), 0),
        COALESCE((SELECT MAX(s.rok) FROM mcvv_start s WHERE s.bezec_id = b.id), 0),
        COALESCE((SELECT MAX(r.rok) FROM mcvv_prihlaska_radek r WHERE r.bezec_id = b.id), 0)
      ) AS last_year
    FROM cis_bezec b
    WHERE ${runnerSearchWhere(terms)}
    ORDER BY b.jmeno, b.id
    LIMIT ${RUNNER_SUGGEST_LIMIT}`);
  return rows.map((row) => ({
    id: row.id,
    name: row.jmeno,
    born: row.id.slice(0, 4),
    nationality: row.statni_prislusnost,
    club: row.club?.trim() || null,
    lastYear: Number(row.last_year ?? 0) || null,
  }));
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
