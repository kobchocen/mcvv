/**
 * Public club profile /kluby/[slug] (#105): starts per year, the club's runners and best
 * results. Pure; rows are all results with the written club name.
 */
import type { RawResult } from "@/lib/stats/core";
import { runnerSex } from "@/lib/stats/core";

import { mostCommonSpelling, normalizeClubName, type ClubResolver } from "./core";

export type ClubTarget =
  { kind: "canonical"; id: number; slug: string; name: string } | { kind: "name"; key: string };

export type ClubPerformance = { runnerId: string; name: string; year: number; time: number };

export type ClubProfile = {
  name: string;
  slug: string;
  canonical: boolean;
  /** Written names counted under this club, most used first. */
  variants: { name: string; starts: number }[];
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

export function clubTargetMatches(
  target: ClubTarget,
  resolver: ClubResolver,
  clubName: string | null | undefined,
): boolean {
  const resolved = resolver.resolve(clubName);
  if (!resolved) return false;
  return target.kind === "canonical"
    ? resolved.canonicalId === target.id
    : resolved.canonicalId === null && resolved.key === `n:${target.key}`;
}

export function computeClubProfile(
  results: readonly RawResult[],
  resolver: ClubResolver,
  target: ClubTarget,
  slug: string,
  bestLimit = 10,
): ClubProfile | null {
  const rows = results.filter((row) => clubTargetMatches(target, resolver, row.clubName));
  if (rows.length === 0) return null;

  const spellings = new Map<string, number>();
  const perYear = new Map<number, number>();
  const members = new Map<string, ClubProfile["members"][number]>();
  for (const row of rows) {
    const spelling = (row.clubName ?? "").trim();
    spellings.set(spelling, (spellings.get(spelling) ?? 0) + 1);
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
  const variants = [...spellings.entries()]
    .map(([name, starts]) => ({ name, starts }))
    .sort((a, b) => b.starts - a.starts || a.name.localeCompare(b.name, "cs"));
  return {
    name: target.kind === "canonical" ? target.name : mostCommonSpelling(spellings),
    slug,
    canonical: target.kind === "canonical",
    variants,
    starts: rows.length,
    runners: members.size,
    firstYear: years[0],
    lastYear: years.at(-1) as number,
    perYear: years.map((year) => ({ year, starts: perYear.get(year) ?? 0 })),
    members: [...members.values()].sort(
      (a, b) =>
        b.starts - a.starts || b.lastYear - a.lastYear || a.name.localeCompare(b.name, "cs"),
    ),
    best: { M: bestOf("M"), F: bestOf("F") },
  };
}

/** Target for a slug of a written (not yet merged) name. */
export function nameTarget(slug: string): ClubTarget {
  return { kind: "name", key: normalizeClubName(slug) };
}
