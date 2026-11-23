/**
 * Load classified finishers for the team competition from official results (`mcvv_time`).
 * Teams are grouped by club id in the edition; the name is that id's spelling in the year,
 * with no aliases or merges.
 */
import { getClubIndex } from "@/lib/clubs/cached";
import { createClubResolver } from "@/lib/clubs/core";
import { prisma } from "@/lib/db/client";
import { runnerNameFor } from "@/lib/format/runner-name";
import { isPublicYear, PUBLIC_YEAR_WHERE } from "@/lib/testmode/public-year";

import {
  computeTeamCompetition,
  finishersFromTimedResults,
  officialPodium,
  winnersOf,
  type TeamCompetition,
  type TeamFinisher,
  type TeamYearWinner,
  type TimedTeamResult,
} from "./scoring";

export type YearTeamCompetition = {
  year: number;
  finisherCount: number;
  competition: TeamCompetition;
};

function toTimed(rows: readonly TimedTeamResult[]): TeamFinisher[] {
  return finishersFromTimedResults(rows);
}

export async function loadYearTeamFinishers(year: number): Promise<TeamFinisher[] | null> {
  if (!isPublicYear(year)) return null;
  const [raw, index] = await Promise.all([
    prisma.result.findMany({
      where: { year },
      orderBy: { time: "asc" },
      include: {
        category: { select: { name: true } },
        club: { select: { name: true } },
        runner: { select: { name: true } },
      },
    }),
    getClubIndex(),
  ]);
  if (raw.length === 0) return null;
  const clubs = createClubResolver(index);
  return toTimed(
    raw.map((row) => {
      const resolved = clubs.resolve(row.clubId, row.year, row.club?.name || row.clubName);
      return {
        categoryId: row.categoryId,
        categoryName: row.category?.name ?? row.categoryId,
        time: row.time,
        runnerName: runnerNameFor("results", row.runnerName, row.runner?.name) ?? "—",
        clubId: resolved?.mainId ?? null,
        clubName: resolved?.name ?? null,
      };
    }),
  );
}

export async function loadYearTeamCompetition(year: number): Promise<YearTeamCompetition | null> {
  const finishers = await loadYearTeamFinishers(year);
  if (!finishers) return null;
  return { year, finisherCount: finishers.length, competition: computeTeamCompetition(finishers) };
}

export async function loadAllTeamCompetitions(): Promise<YearTeamCompetition[]> {
  const [raw, index] = await Promise.all([
    prisma.result.findMany({
      where: { year: PUBLIC_YEAR_WHERE },
      orderBy: [{ year: "asc" }, { time: "asc" }],
      include: {
        category: { select: { name: true } },
        club: { select: { name: true } },
        runner: { select: { name: true } },
      },
    }),
    getClubIndex(),
  ]);
  const clubs = createClubResolver(index);
  const byYear = new Map<number, TimedTeamResult[]>();
  for (const row of raw) {
    if (!isPublicYear(row.year)) continue;
    const list = byYear.get(row.year) ?? [];
    const resolved = clubs.resolve(row.clubId, row.year, row.club?.name || row.clubName);
    list.push({
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? row.categoryId,
      time: row.time,
      runnerName: runnerNameFor("results", row.runnerName, row.runner?.name) ?? "—",
      clubId: resolved?.mainId ?? null,
      clubName: resolved?.name ?? null,
    });
    byYear.set(row.year, list);
  }
  return [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, rows]) => {
      const finishers = toTimed(rows);
      return {
        year,
        finisherCount: finishers.length,
        competition: computeTeamCompetition(finishers),
      };
    });
}

export function winnerList(years: readonly YearTeamCompetition[]): TeamYearWinner[] {
  return years.flatMap((row) => winnersOf(row.competition, row.year));
}

export function podiumList(
  years: readonly YearTeamCompetition[],
  depth = 3,
): { year: number; finisherCount: number; podium: ReturnType<typeof officialPodium> }[] {
  return years.map((row) => ({
    year: row.year,
    finisherCount: row.finisherCount,
    podium: officialPodium(row.competition, depth),
  }));
}
