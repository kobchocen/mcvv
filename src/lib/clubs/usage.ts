/** Usage of written club names in results, input for merge suggestions (#104). Pure. */
import type { RawResult } from "@/lib/stats/core";

import { isNoClub, mostCommonSpelling, normalizeClubName, type ClubResolver } from "./core";
import type { ClubNameUsage } from "./suggest";

export function clubNameUsage(
  results: readonly Pick<RawResult, "year" | "clubName">[],
  resolver: ClubResolver,
): (ClubNameUsage & { spellings: { name: string; starts: number }[] })[] {
  const byKey = new Map<
    string,
    { spellings: Map<string, number>; starts: number; first: number; last: number }
  >();
  for (const row of results) {
    const name = (row.clubName ?? "").trim();
    if (isNoClub(name)) continue;
    const key = normalizeClubName(name);
    const entry = byKey.get(key) ?? {
      spellings: new Map<string, number>(),
      starts: 0,
      first: row.year,
      last: row.year,
    };
    entry.starts += 1;
    entry.first = Math.min(entry.first, row.year);
    entry.last = Math.max(entry.last, row.year);
    entry.spellings.set(name, (entry.spellings.get(name) ?? 0) + 1);
    byKey.set(key, entry);
  }
  return [...byKey.entries()]
    .map(([key, entry]) => {
      const name = mostCommonSpelling(entry.spellings);
      return {
        key,
        name,
        starts: entry.starts,
        firstYear: entry.first,
        lastYear: entry.last,
        canonicalId: resolver.resolve(name)?.canonicalId ?? null,
        spellings: [...entry.spellings.entries()]
          .map(([spelling, starts]) => ({ name: spelling, starts }))
          .sort((a, b) => b.starts - a.starts),
      };
    })
    .sort((a, b) => b.starts - a.starts || a.name.localeCompare(b.name, "cs"));
}
