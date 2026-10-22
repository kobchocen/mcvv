/**
 * Public club profile /kluby/[slug] (#105): starts per year, the club's runners and best
 * results. A club is its id (#104, Q34; merged ids are rewritten to it, Q45); its names per
 * edition are its history. Pure; rows are all results.
 */
import type { RawResult } from "@/lib/stats/core";
import { runnerSex } from "@/lib/stats/core";

import { clubKey, type ClubResolver } from "./core";

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
  perYear: { year: number; starts: number }[];
  members: {
    runnerId: string;
    name: string;
    starts: number;
    best: number;
    firstYear: number;
    lastYear: number;
  }[];
  /** Best time of each runner, fastest first (per sex). */
  best: Record<"M" | "F", ClubPerformance[]>;
};

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
  const members = new Map<string, ClubProfile["members"][number]>();
  for (const row of rows) {
    perYear.set(row.year, (perYear.get(row.year) ?? 0) + 1);
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
    perYear: years.map((year) => ({ year, starts: perYear.get(year) ?? 0 })),
    members: [...members.values()].sort(
      (a, b) =>
        b.starts - a.starts || b.lastYear - a.lastYear || a.name.localeCompare(b.name, "cs"),
    ),
    best: { M: bestOf("M"), F: bestOf("F") },
  };
}
