/**
 * Tombola po závodě (#128) – čisté funkce bez DB.
 *
 * Legacy `admin/tombola.php`: 20× `rand()` z doběhnuvších mimo klub CHC, jména se mohla
 * opakovat. Tady: deterministické zamíchání podle „losu“ (seed v URL), takže obnovení
 * stránky výsledek nezmění, vylosovaní se neopakují a zvýšení počtu jen přidá další jména.
 */
export const TOMBOLA_DEFAULT_COUNT = 20;
export const TOMBOLA_MAX_COUNT = 200;
/** Legacy vynechává pořádající klub. */
export const TOMBOLA_DEFAULT_EXCLUDED = ["CHC"] as const;

export type TombolaEntrant = {
  runnerId: string;
  name: string;
  clubId: string;
  club: string;
};

export function parseTombolaCount(raw: string | null | undefined): number {
  const value = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(value) || value < 1) return TOMBOLA_DEFAULT_COUNT;
  return Math.min(value, TOMBOLA_MAX_COUNT);
}

/** Los = 1–12 znaků [a-z0-9]; jiný vstup znamená „vylosovat nový“. */
export function parseTombolaSeed(raw: string | null | undefined): string | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return /^[a-z0-9]{1,12}$/.test(value) ? value : null;
}

export function newTombolaSeed(random: () => number = Math.random): string {
  return Array.from({ length: 8 }, () => Math.floor(random() * 36).toString(36)).join("");
}

/** Vynechané kluby z URL; bez parametru výchozí CHC, prázdný seznam = nikoho nevynechat. */
export function parseExcludedClubs(raw: string[] | undefined, submitted: boolean): Set<string> {
  if (!submitted) return new Set(TOMBOLA_DEFAULT_EXCLUDED);
  return new Set((raw ?? []).map((id) => id.trim().toUpperCase()).filter(Boolean));
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 – malý deterministický PRNG (losování, ne kryptografie). */
function prng(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Vylosuje až `count` různých běžců (podle ID) z doběhnuvších mimo vynechané kluby.
 * Pořadí vstupu nehraje roli (třídí se podle ID), výsledek závisí jen na losu a filtru.
 */
export function drawTombola(
  entrants: readonly TombolaEntrant[],
  options: { count: number; seed: string; excludedClubs: ReadonlySet<string> },
): TombolaEntrant[] {
  const unique = new Map<string, TombolaEntrant>();
  for (const entrant of entrants) {
    if (options.excludedClubs.has(entrant.clubId.toUpperCase())) continue;
    if (!unique.has(entrant.runnerId)) unique.set(entrant.runnerId, entrant);
  }
  const pool = [...unique.values()].sort((a, b) => a.runnerId.localeCompare(b.runnerId));
  const random = prng(options.seed);
  // Fisher–Yates zepředu: prvních k pozic nezávisí na celkovém počtu losovaných.
  for (let i = 0; i < pool.length - 1; i += 1) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, options.count));
}

/** Kluby doběhnuvších pro filtr (podle počtu běžců, pak názvu). */
export function tombolaClubs(entrants: readonly TombolaEntrant[]) {
  const clubs = new Map<string, { id: string; name: string; count: number }>();
  for (const entrant of entrants) {
    const id = entrant.clubId.toUpperCase();
    const club = clubs.get(id) ?? { id, name: entrant.club || id, count: 0 };
    club.count += 1;
    clubs.set(id, club);
  }
  return [...clubs.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "cs"),
  );
}
