/**
 * Club identity across editions (#104, Q34): a club is its `cis_klub.id`. The name belongs to
 * the edition (`cis_klub` key = id + year), so a renamed club keeps its id and profile.
 * Two ids that are in fact one club (e.g. 216 "KOB Choceń" and CHC "K.O.B. Choceň") are
 * joined only by a manual merge in the admin (`mcvv_klub_slouceni`, id → main id); the
 * legacy rows are never rewritten. Pure helpers, no DB access.
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

/** One `cis_klub` row: name of the id in an edition. */
export type ClubNameRow = { id: string; year: number; name: string };

/** One manual merge: `clubId` is counted under `mainClubId`. */
export type ClubMergeRef = { clubId: string; mainClubId: string };

export type ResolvedClub = {
  /** Main id (the id itself unless merged). */
  mainId: string;
  /** Profile slug of the main id. */
  slug: string;
  /** Name to show for this row (see `ClubResolver.display`). */
  name: string;
};

export type ClubResolver = {
  /** Main id of an id (itself unless merged); "" for an empty id. */
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
  /**
   * Name for a row: for a merged id the main id's name in the same edition (both ids in one
   * edition are shown as one club), otherwise the row's own name; "—" for no club.
   */
  display(id: string | null | undefined, year: number, written?: string | null): string;
  /** Profile name of a main id: its newest name (or of a merged id when it has none). */
  profileName(mainId: string): string;
  /** Profile slug of a main id. */
  slug(mainId: string): string;
  /** Main id and every id merged into it, main first. */
  members(mainId: string): string[];
  /** Names of an id per edition (newest first). */
  history(id: string): { year: number; name: string }[];
};

export function createClubResolver(
  input: { names?: readonly ClubNameRow[]; merges?: readonly ClubMergeRef[] } = {},
): ClubResolver {
  const mainOf = new Map<string, string>();
  for (const merge of input.merges ?? []) {
    mainOf.set(clubKey(merge.clubId), clubKey(merge.mainClubId));
  }
  const byId = new Map<string, Map<number, string>>();
  for (const row of input.names ?? []) {
    const id = clubKey(row.id);
    const years = byId.get(id) ?? new Map<number, string>();
    years.set(row.year, row.name.trim());
    byId.set(id, years);
  }
  const membersOf = new Map<string, string[]>();
  for (const [id, main] of mainOf) {
    membersOf.set(main, [...(membersOf.get(main) ?? []), id].sort());
  }

  const mainId = (id: string | null | undefined): string => {
    const key = clubKey(id);
    return mainOf.get(key) ?? key;
  };
  const nameIn = (id: string, year: number): string | null => {
    const name = byId.get(id)?.get(year);
    return name && !isNoClub(name) ? name : null;
  };
  const history = (id: string) =>
    [...(byId.get(clubKey(id)) ?? new Map<number, string>()).entries()]
      .filter(([, name]) => !isNoClub(name))
      .map(([year, name]) => ({ year, name }))
      .sort((a, b) => b.year - a.year);
  const profileNames = new Map<string, string>();
  const profileName = (main: string): string => {
    const key = clubKey(main);
    const cached = profileNames.get(key);
    if (cached !== undefined) return cached;
    const own = history(key)[0]?.name;
    const merged = (membersOf.get(key) ?? [])
      .flatMap((id) => history(id))
      .sort((a, b) => b.year - a.year)[0]?.name;
    const name = own ?? merged ?? "";
    profileNames.set(key, name);
    return name;
  };
  const slug = (main: string) => clubIdSlug(main, profileName(main));
  const resolve = (
    id: string | null | undefined,
    year: number,
    written?: string | null,
  ): ResolvedClub | null => {
    const key = clubKey(id);
    const own = (written ?? byId.get(key)?.get(year) ?? "").trim();
    if (!key || isNoClub(own)) return null;
    const main = mainId(key);
    const name = (main !== key ? nameIn(main, year) : null) ?? own;
    return { mainId: main, slug: slug(main), name };
  };
  return {
    mainId,
    resolve,
    display(id, year, written) {
      return resolve(id, year, written)?.name ?? "—";
    },
    profileName,
    slug,
    members(main) {
      const key = clubKey(main);
      return [key, ...(membersOf.get(key) ?? [])];
    },
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
