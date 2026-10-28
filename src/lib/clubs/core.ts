/**
 * Club identity across editions (#104, Q34): a club is its `cis_klub.id`. The name belongs to
 * the edition (`cis_klub` key = id + year), so a renamed club keeps its id and profile.
 * Two ids that are in fact one club (e.g. 216 "KOB Choceń" and CHC "K.O.B. Choceň") are
 * joined only by a manual merge in the admin, which rewrites the data to the main id (Q45,
 * `merge-apply.ts`): the merged id no longer exists, so reading needs no folding.
 * Pure helpers, no DB access.
 */

/**
 * Comparison key of a written club name: case, diacritics, spaces and punctuation are ignored
 * ("K.O.B. Choceň" = "kob chocen"). Used for similarity and placeholders only – never as the
 * identity of a club.
 */
export function normalizeClubName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Placeholders meaning "no club" (after normalization), e.g. id 000 or XXX with "-". */
const NO_CLUB = new Set(["", "neregistrovany", "neregistrovana", "nereg", "bezklubu", "zadny"]);

export function isNoClub(name: string | null | undefined): boolean {
  return NO_CLUB.has(normalizeClubName(name));
}

/** URL part of a club name: ASCII, lowercase, words joined by "-". */
export function clubSlug(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/** Canonical form of a club id (DB collation is case-insensitive, ids are stored uppercase). */
export function clubKey(id: string | null | undefined): string {
  return (id ?? "").trim().toUpperCase();
}

/** Profile slug of a club: "<id>-<name>", e.g. "chc-k-o-b-chocen"; the id decides. */
export function clubIdSlug(id: string, name: string | null | undefined): string {
  const idPart = encodeURIComponent(clubKey(id).toLowerCase());
  const namePart = clubSlug(name);
  return namePart ? `${idPart}-${namePart}` : idPart;
}

/** Club id from a profile slug (the part before the first "-"). */
export function clubIdFromSlug(slug: string): string {
  const [idPart = ""] = slug.split("-");
  try {
    return clubKey(decodeURIComponent(idPart));
  } catch {
    return clubKey(idPart);
  }
}

/**
 * Profile slug for a club link (#196): a resolved slug if the caller has one, otherwise
 * "<id>-<name>" from the row's club id (a stale name part redirects to the profile of the id).
 * The id in the data is already the main id after a merge (Q45). null = no link: no id, or a
 * placeholder "no club" name (000 / "-" / neregistrovaný).
 */
export function clubLinkSlug(input: {
  slug?: string | null;
  id?: string | null;
  name?: string | null;
}): string | null {
  if (isNoClub(input.name)) return null;
  if (input.slug) return input.slug;
  const id = clubKey(input.id);
  return id ? clubIdSlug(id, input.name) : null;
}

/** One `cis_klub` row: name of the id in an edition. */
export type ClubNameRow = { id: string; year: number; name: string };

export type ResolvedClub = {
  /** Club id (canonical form). Merged ids are rewritten in the data, so it is the club. */
  mainId: string;
  /** Profile slug of the club. */
  slug: string;
  /** Name to show for this row (see `ClubResolver.display`). */
  name: string;
};

export type ClubResolver = {
  /** Canonical club id (see `clubKey`); "" for an empty id. */
  mainId(id: string | null | undefined): string;
  /**
   * The club of a result / start row. `written` is the row's own name in that edition
   * (cis_klub.jmeno for id + year). null = no club (placeholder name such as 000 / "-").
   */
  resolve(
    id: string | null | undefined,
    year: number,
    written?: string | null,
  ): ResolvedClub | null;
  /** Name for a row: the row's own name in that edition; "—" for no club. */
  display(id: string | null | undefined, year: number, written?: string | null): string;
  /** Profile name of a club: its newest name. */
  profileName(mainId: string): string;
  /** Profile slug of a club. */
  slug(mainId: string): string;
  /** Names of an id per edition (newest first). */
  history(id: string): { year: number; name: string }[];
};

export function createClubResolver(input: { names?: readonly ClubNameRow[] } = {}): ClubResolver {
  const byId = new Map<string, Map<number, string>>();
  for (const row of input.names ?? []) {
    const id = clubKey(row.id);
    const years = byId.get(id) ?? new Map<number, string>();
    years.set(row.year, row.name.trim());
    byId.set(id, years);
  }

  const history = (id: string) =>
    [...(byId.get(clubKey(id)) ?? new Map<number, string>()).entries()]
      .filter(([, name]) => !isNoClub(name))
      .map(([year, name]) => ({ year, name }))
      .sort((a, b) => b.year - a.year);
  const profileNames = new Map<string, string>();
  const profileName = (id: string): string => {
    const key = clubKey(id);
    const cached = profileNames.get(key);
    if (cached !== undefined) return cached;
    const name = history(key)[0]?.name ?? "";
    profileNames.set(key, name);
    return name;
  };
  const slug = (id: string) => clubIdSlug(id, profileName(id));
  const resolve = (
    id: string | null | undefined,
    year: number,
    written?: string | null,
  ): ResolvedClub | null => {
    const key = clubKey(id);
    const own = (written ?? byId.get(key)?.get(year) ?? "").trim();
    if (!key || isNoClub(own)) return null;
    return { mainId: key, slug: slug(key), name: own };
  };
  return {
    mainId: clubKey,
    resolve,
    display(id, year, written) {
      return resolve(id, year, written)?.name ?? "—";
    },
    profileName,
    slug,
    history,
  };
}

/** Most frequent spelling (ties: alphabetical). */
export function mostCommonSpelling(spellings: ReadonlyMap<string, number>): string {
  return (
    [...spellings.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "cs"),
    )[0]?.[0] ?? ""
  );
}
