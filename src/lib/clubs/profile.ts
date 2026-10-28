/**
 * Public club profile /kluby/[slug] (#105): starts per year, the club's runners and best
 * results. A club is its id (#104, Q34; merged ids are rewritten to it, Q45); its names per
 * edition are its history. Pure; rows are all results.
 */
import type { RawResult } from "@/lib/stats/core";
import { runnerSex } from "@/lib/stats/core";

import {
  clubIdFromSlug,
  clubKey,
  normalizeClubName,
  type ClubNameRow,
  type ClubResolver,
} from "./core";

export type ClubPerformance = { runnerId: string; name: string; year: number; time: number };

export type ClubProfile = {
  /** Club id. */
  id: string;
  name: string;
  slug: string;
  /** Names of the club, newest first: when each name was used. */
  history: { id: string; name: string; firstYear: number; lastYear: number }[];
  starts: number;
  runners: number;
  firstYear: number;
  lastYear: number;
  /** Starts per edition with the club's fastest man and woman of that edition. */
  perYear: { year: number; starts: number; best: Partial<Record<"M" | "F", ClubPerformance>> }[];
  members: {
    runnerId: string;
    name: string;
    starts: number;
    best: number;
    firstYear: number;
    lastYear: number;
  }[];
  /** Best time of each runner, fastest first (per sex); `[0]` is the club record. */
  best: Record<"M" | "F", ClubPerformance[]>;
  /**
   * Fastest results of the club across editions, not unique per runner (#197): one runner
   * may appear several times.
   */
  topResults: Record<"M" | "F", ClubPerformance[]>;
  /** Member(s) with the most starts for the club (#197); ties list several runners. */
  mostStarts: { starts: number; runners: ClubProfile["members"] } | null;
};

/** At most this many runners shown for a tie in "most starts". */
export const MOST_STARTS_TIES = 3;

export function computeClubProfile(
  results: readonly RawResult[],
  resolver: ClubResolver,
  mainIdRaw: string,
  bestLimit = 10,
): ClubProfile | null {
  const mainId = clubKey(mainIdRaw);
  if (!mainId || resolver.mainId(mainId) !== mainId) return null;
  const rows = results.filter(
    (row) => resolver.resolve(row.clubId, row.year, row.clubName)?.mainId === mainId,
  );
  // Consecutive editions with the same name form one entry.
  const history: ClubProfile["history"] = [];
  for (const { year, name } of [...resolver.history(mainId)].reverse()) {
    const last = history.at(-1);
    if (last && last.name === name) last.lastYear = year;
    else history.push({ id: mainId, name, firstYear: year, lastYear: year });
  }
  if (rows.length === 0 && history.length === 0) return null;
  history.sort((a, b) => b.lastYear - a.lastYear || b.firstYear - a.firstYear);

  const perYear = new Map<number, number>();
  const yearBest = new Map<number, Partial<Record<"M" | "F", ClubPerformance>>>();
  const faster = (a: ClubPerformance, b: ClubPerformance | undefined) =>
    !b || a.time < b.time || (a.time === b.time && a.runnerId < b.runnerId);
  const members = new Map<string, ClubProfile["members"][number]>();
  for (const row of rows) {
    perYear.set(row.year, (perYear.get(row.year) ?? 0) + 1);
    const sex = runnerSex(row.runnerId);
    const inYear = yearBest.get(row.year) ?? {};
    const performance = {
      runnerId: row.runnerId,
      name: row.runnerName || "—",
      year: row.year,
      time: row.time,
    };
    if (faster(performance, inYear[sex])) inYear[sex] = performance;
    yearBest.set(row.year, inYear);
    const member = members.get(row.runnerId);
    const name = row.runnerName || "—";
    if (!member) {
      members.set(row.runnerId, {
        runnerId: row.runnerId,
        name,
        starts: 1,
        best: row.time,
        firstYear: row.year,
        lastYear: row.year,
      });
    } else {
      member.starts += 1;
      member.best = Math.min(member.best, row.time);
      member.firstYear = Math.min(member.firstYear, row.year);
      if (row.year >= member.lastYear) {
        member.lastYear = row.year;
        member.name = name;
      }
    }
  }

  const bestOf = (sex: "M" | "F"): ClubPerformance[] => {
    const perRunner = new Map<string, ClubPerformance>();
    for (const row of rows) {
      if (runnerSex(row.runnerId) !== sex) continue;
      const current = perRunner.get(row.runnerId);
      if (!current || row.time < current.time) {
        perRunner.set(row.runnerId, {
          runnerId: row.runnerId,
          name: row.runnerName || "—",
          year: row.year,
          time: row.time,
        });
      }
    }
    return [...perRunner.values()]
      .sort((a, b) => a.time - b.time || a.year - b.year || a.runnerId.localeCompare(b.runnerId))
      .slice(0, bestLimit);
  };

  const topOf = (sex: "M" | "F"): ClubPerformance[] =>
    rows
      .filter((row) => runnerSex(row.runnerId) === sex)
      .map((row) => ({
        runnerId: row.runnerId,
        name: row.runnerName || "—",
        year: row.year,
        time: row.time,
      }))
      .sort((a, b) => a.time - b.time || a.year - b.year || a.runnerId.localeCompare(b.runnerId))
      .slice(0, bestLimit);

  const sortedMembers = [...members.values()].sort(
    (a, b) => b.starts - a.starts || b.lastYear - a.lastYear || a.name.localeCompare(b.name, "cs"),
  );
  const maxStarts = sortedMembers[0]?.starts ?? 0;
  const mostStarts =
    maxStarts > 0
      ? {
          starts: maxStarts,
          runners: sortedMembers
            .filter((member) => member.starts === maxStarts)
            .slice(0, MOST_STARTS_TIES),
        }
      : null;

  const years = [...perYear.keys()].sort((a, b) => a - b);
  const historyYears = history.flatMap((row) => [row.firstYear, row.lastYear]);
  return {
    id: mainId,
    name: resolver.profileName(mainId),
    slug: resolver.slug(mainId),
    history,
    starts: rows.length,
    runners: members.size,
    firstYear: years[0] ?? Math.min(...historyYears),
    lastYear: years.at(-1) ?? Math.max(...historyYears),
    perYear: years.map((year) => ({
      year,
      starts: perYear.get(year) ?? 0,
      best: yearBest.get(year) ?? {},
    })),
    members: sortedMembers,
    best: { M: bestOf("M"), F: bestOf("F") },
    topResults: { M: topOf("M"), F: topOf("F") },
    mostStarts,
  };
}

/**
 * Main id and canonical slug for a requested profile slug. The id decides (#104, Q34); an old
 * name-only slug (#167) means the id that used that name most recently. null = unknown club.
 */
export function resolveClubSlug(
  slug: string,
  names: readonly ClubNameRow[],
  resolver: ClubResolver,
): { mainId: string; canonical: string } | null {
  let id = clubIdFromSlug(slug);
  if (!names.some((row) => clubKey(row.id) === id)) {
    const key = normalizeClubName(slug);
    if (!key) return null;
    const match = [...names]
      .sort((a, b) => b.year - a.year)
      .find((row) => normalizeClubName(row.name) === key);
    if (!match) return null;
    id = clubKey(match.id);
  }
  const mainId = resolver.mainId(id);
  return { mainId, canonical: resolver.slug(mainId) };
}
