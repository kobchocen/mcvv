/**
 * Club names across editions (#104). `cis_klub` has no stable id (key = id + year) and the same
 * club appears under different spellings. A canonical club (`mcvv_klub`) with aliases
 * (`mcvv_klub_alias`) is created only by a manual confirmation in the admin; until then a name
 * is shown as it was written. Pure helpers, no DB access.
 */

/**
 * Identity key of a written club name: case, diacritics, spaces and punctuation are ignored
 * ("K.O.B. Choceň" = "kob chocen"). Used since 1.1.0 for "Nejvěrnější klub"; this is not a
 * merge of different names, only the same name written differently.
 */
export function normalizeClubName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Placeholders meaning "no club" (after normalization). */
const NO_CLUB = new Set(["", "neregistrovany", "neregistrovana", "nereg", "bezklubu", "zadny"]);

export function isNoClub(name: string | null | undefined): boolean {
  return NO_CLUB.has(normalizeClubName(name));
}

/**
 * URL slug of a club name: ASCII, lowercase, words joined by "-". Removing the dashes gives
 * the identity key, so `normalizeClubName(clubSlug(x)) === normalizeClubName(x)`.
 */
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

export type CanonicalClubRef = { id: number; slug: string; name: string };

/** A confirmed alias: identity key of a written name → canonical club. */
export type ClubAliasRef = { key: string; club: CanonicalClubRef };

export type ResolvedClub = {
  /** Grouping key: "c:<id>" for a canonical club, "n:<identity key>" otherwise. */
  key: string;
  slug: string;
  /** Canonical name, or null when the name is not mapped (show it as written). */
  canonicalName: string | null;
  canonicalId: number | null;
};

export type ClubResolver = {
  /** null for an empty / "no club" name. */
  resolve(name: string | null | undefined): ResolvedClub | null;
  /** Name to show for a result row: canonical name if mapped, else as written (or "—"). */
  display(name: string | null | undefined): string;
};

export function createClubResolver(aliases: readonly ClubAliasRef[] = []): ClubResolver {
  const byKey = new Map(aliases.map((alias) => [alias.key, alias.club]));
  const resolve = (name: string | null | undefined): ResolvedClub | null => {
    const key = normalizeClubName(name);
    if (NO_CLUB.has(key)) {
      return null;
    }
    const club = byKey.get(key);
    if (club) {
      return {
        key: `c:${club.id}`,
        slug: club.slug,
        canonicalName: club.name,
        canonicalId: club.id,
      };
    }
    return { key: `n:${key}`, slug: clubSlug(name) || key, canonicalName: null, canonicalId: null };
  };
  return {
    resolve,
    display(name) {
      const written = (name ?? "").trim();
      const resolved = resolve(written);
      return resolved?.canonicalName ?? (written || "—");
    },
  };
}

/** Most frequent spelling (ties: alphabetical), used for a club that has no canonical name. */
export function mostCommonSpelling(spellings: ReadonlyMap<string, number>): string {
  return (
    [...spellings.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "cs"),
    )[0]?.[0] ?? ""
  );
}
