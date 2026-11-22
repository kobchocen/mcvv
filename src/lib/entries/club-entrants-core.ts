/**
 * Pure helpers for the public club-entrants page (#352).
 * Only the fields already shown on /prihlaseni-zavodnici; no payment or entry status.
 */
import {
  clubIdFromSlug,
  clubIdSlug,
  clubKey,
  clubSlug,
  isNoClub,
  normalizeClubName,
} from "@/lib/clubs/core";
import { isNewbie } from "@/lib/entries/newbie";

export type PublicEntrant = {
  categoryId: string;
  categorySort: number;
  categoryName: string;
  id: string;
  name: string;
  nationality: string | null;
  birth: string;
  club: string;
  clubId: string;
  starts: number;
  newbie: boolean;
  record: number | null;
};

export type PublicEntrantRunner = Omit<
  PublicEntrant,
  "categoryId" | "categorySort" | "categoryName"
>;

export type PublicEntrantCategory = {
  id: string;
  sort: number;
  name: string;
  runners: PublicEntrantRunner[];
};

export type ClubYearRef = {
  clubId: string;
  clubName: string;
  canonical: string;
};

/** Clubs that have at least one public entrant, keyed by canonical club id. */
export function uniqueClubsFromEntrants(entrants: readonly PublicEntrant[]): ClubYearRef[] {
  const byId = new Map<string, ClubYearRef>();
  for (const row of entrants) {
    if (isNoClub(row.club)) continue;
    const clubId = clubKey(row.clubId);
    if (!clubId || byId.has(clubId)) continue;
    byId.set(clubId, {
      clubId,
      clubName: row.club,
      canonical: clubIdSlug(clubId, row.club),
    });
  }
  return [...byId.values()];
}

/**
 * Resolve a club-entrants URL slug against clubs that have public entries this year.
 * Accepts the canonical "<id>-<name>" slug, a stale name part with a valid id, or a
 * name-only slug. Returns null when the club is unknown or has no public entries.
 */
export function resolveClubAmongEntrants(
  slug: string,
  clubs: readonly ClubYearRef[],
): ClubYearRef | null {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  const exact = clubs.find((club) => club.canonical === trimmed);
  if (exact) return exact;

  const id = clubIdFromSlug(trimmed);
  const byId = clubs.find((club) => club.clubId === id);
  if (byId) return byId;

  const nameSlug = trimmed.toLowerCase();
  const nameKey = normalizeClubName(trimmed);
  const byName = clubs.find(
    (club) => clubSlug(club.clubName) === nameSlug || normalizeClubName(club.clubName) === nameKey,
  );
  return byName ?? null;
}

export function groupPublicEntrants(
  entrants: readonly PublicEntrant[],
  locale: string,
): PublicEntrantCategory[] {
  const groups = new Map<string, PublicEntrantCategory>();
  for (const row of entrants) {
    const group = groups.get(row.categoryId) ?? {
      id: row.categoryId,
      sort: row.categorySort,
      name: row.categoryName,
      runners: [],
    };
    group.runners.push({
      id: row.id,
      name: row.name,
      nationality: row.nationality,
      birth: row.birth,
      club: row.club,
      clubId: row.clubId,
      starts: row.starts,
      newbie: row.newbie,
      record: row.record,
    });
    groups.set(row.categoryId, group);
  }
  const categories = [...groups.values()].sort((a, b) => a.sort - b.sort);
  for (const group of categories) {
    group.runners.sort((a, b) => a.name.localeCompare(b.name, locale));
  }
  return categories;
}

type RegistrationLineRow = {
  runnerId: string;
  clubId: string;
  categoryId: string;
  runner: { name: string; nationality: string | null };
  club: { name: string };
  category: { name: string; sort: number };
};

export function toPublicEntrant(
  line: RegistrationLineRow,
  startsById: ReadonlyMap<string, number>,
  recordsById: ReadonlyMap<string, number | null | undefined>,
): PublicEntrant {
  const starts = startsById.get(line.runnerId) ?? 0;
  return {
    categoryId: line.categoryId,
    categorySort: line.category.sort,
    categoryName: line.category.name,
    id: line.runnerId,
    name: line.runner.name,
    nationality: line.runner.nationality,
    birth: line.runnerId.slice(0, 4),
    club: line.club.name,
    clubId: line.clubId,
    starts,
    newbie: isNewbie(starts),
    record: recordsById.get(line.runnerId) ?? null,
  };
}
