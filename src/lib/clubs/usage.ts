/** Usage of club ids in results, input for merge suggestions and the admin (#104). Pure. */
import type { RawResult } from "@/lib/stats/core";

import { clubKey, type ClubNameRow, type ClubResolver } from "./core";
import type { ClubUsage } from "./suggest";

/**
 * One entry per main id (merged ids included): its names per edition and starts in results.
 * Ids that are only in `cis_klub` (e.g. registered this year, no result yet) have 0 starts.
 */
export function clubUsage(
  results: readonly Pick<RawResult, "year" | "clubId" | "clubName">[],
  names: readonly ClubNameRow[],
  resolver: ClubResolver,
): ClubUsage[] {
  const byMain = new Map<
    string,
    { names: Map<string, Set<number>>; years: Map<string, Set<number>>; starts: number }
  >();
  const entry = (main: string) => {
    const current = byMain.get(main) ?? {
      names: new Map<string, Set<number>>(),
      years: new Map<string, Set<number>>(),
      starts: 0,
    };
    byMain.set(main, current);
    return current;
  };
  for (const row of names) {
    const id = clubKey(row.id);
    if (!resolver.resolve(id, row.year, row.name)) continue;
    const main = resolver.mainId(id);
    const current = entry(main);
    const name = row.name.trim();
    current.names.set(name, (current.names.get(name) ?? new Set<number>()).add(row.year));
    current.years.set(id, (current.years.get(id) ?? new Set<number>()).add(row.year));
  }
  for (const row of results) {
    const resolved = resolver.resolve(row.clubId, row.year, row.clubName);
    if (!resolved) continue;
    entry(resolved.mainId).starts += 1;
  }
  return [...byMain.entries()]
    .filter(([, value]) => value.names.size > 0)
    .map(([id, value]) => {
      const allYears = [...value.years.values()].flatMap((set) => [...set]);
      return {
        id,
        name: resolver.profileName(id),
        names: [...value.names.entries()]
          .map(([name, years]) => ({ name, years: [...years].sort((a, b) => a - b) }))
          .sort((a, b) => b.years.at(-1)! - a.years.at(-1)! || a.name.localeCompare(b.name, "cs")),
        ids: resolver.members(id),
        years: [...new Set(allYears)].sort((a, b) => a - b),
        starts: value.starts,
        firstYear: Math.min(...allYears),
        lastYear: Math.max(...allYears),
      };
    })
    .sort((a, b) => b.starts - a.starts || a.name.localeCompare(b.name, "cs"));
}
