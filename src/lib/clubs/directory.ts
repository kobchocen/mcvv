/**
 * Public club list /kluby: every club (main id, merged ids folded in) that has a result, with
 * its starts, runners and editions. Pure; the query layer feeds it one light row per result.
 */
import { clubKey, normalizeClubName, type ClubResolver } from "./core";

/** One result reduced to what the list needs; `clubName` is the written name in that edition. */
export type ClubDirectoryInput = {
  year: number;
  runnerId: string;
  clubId: string | null;
  clubName: string | null;
};

export type ClubDirectoryRow = {
  /** Main id. */
  id: string;
  /** Newest name of the main id (profile name). */
  name: string;
  slug: string;
  mergedIds: string[];
  starts: number;
  runners: number;
  editions: number;
  firstYear: number;
  lastYear: number;
  /** Normalized names the club ever used (all its ids), for search only. */
  searchKeys: string[];
};

export const CLUB_DIRECTORY_SORTS = ["starty", "nazev", "rocniky", "posledni"] as const;
export type ClubDirectorySort = (typeof CLUB_DIRECTORY_SORTS)[number];

export function isClubDirectorySort(value: unknown): value is ClubDirectorySort {
  return typeof value === "string" && (CLUB_DIRECTORY_SORTS as readonly string[]).includes(value);
}

export function computeClubDirectory(
  rows: readonly ClubDirectoryInput[],
  resolver: ClubResolver,
): ClubDirectoryRow[] {
  const byMain = new Map<string, { starts: number; runners: Set<string>; years: Set<number> }>();
  for (const row of rows) {
    const club = resolver.resolve(row.clubId, row.year, row.clubName);
    if (!club) continue;
    const entry = byMain.get(club.mainId) ?? {
      starts: 0,
      runners: new Set<string>(),
      years: new Set<number>(),
    };
    entry.starts += 1;
    entry.runners.add(row.runnerId);
    entry.years.add(row.year);
    byMain.set(club.mainId, entry);
  }
  const list: ClubDirectoryRow[] = [];
  for (const [id, entry] of byMain) {
    const ids = resolver.members(id);
    const years = [...entry.years].sort((a, b) => a - b);
    const searchKeys = new Set<string>();
    for (const member of ids) {
      for (const { name } of resolver.history(member)) searchKeys.add(normalizeClubName(name));
    }
    list.push({
      id,
      name: resolver.profileName(id) || id,
      slug: resolver.slug(id),
      mergedIds: ids.slice(1),
      starts: entry.starts,
      runners: entry.runners.size,
      editions: years.length,
      firstYear: years[0],
      lastYear: years[years.length - 1],
      searchKeys: [...searchKeys].filter(Boolean),
    });
  }
  return sortClubDirectory(list, "starty");
}

/** Matches the newest name, any former name or any id of the club (case/diacritics ignored). */
export function filterClubDirectory(
  rows: readonly ClubDirectoryRow[],
  query: string,
): ClubDirectoryRow[] {
  const key = normalizeClubName(query);
  const id = clubKey(query);
  if (!key && !id) return [...rows];
  return rows.filter(
    (row) =>
      (key && row.searchKeys.some((name) => name.includes(key))) ||
      (key && normalizeClubName(row.name).includes(key)) ||
      [row.id, ...row.mergedIds].some((value) => value === id),
  );
}

export function sortClubDirectory(
  rows: readonly ClubDirectoryRow[],
  sort: ClubDirectorySort,
): ClubDirectoryRow[] {
  const byName = (a: ClubDirectoryRow, b: ClubDirectoryRow) =>
    a.name.localeCompare(b.name, "cs") || a.id.localeCompare(b.id);
  const compare: Record<ClubDirectorySort, (a: ClubDirectoryRow, b: ClubDirectoryRow) => number> = {
    starty: (a, b) => b.starts - a.starts || byName(a, b),
    nazev: byName,
    rocniky: (a, b) => b.editions - a.editions || b.starts - a.starts || byName(a, b),
    posledni: (a, b) => b.lastYear - a.lastYear || b.starts - a.starts || byName(a, b),
  };
  return [...rows].sort(compare[sort]);
}
