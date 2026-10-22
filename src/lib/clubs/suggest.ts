/**
 * Merge suggestions for the admin (#104): pairs of club ids (main ids) whose names look like
 * the same club. A club keeps all names of its id, so renames are never suggested – only
 * different ids. Only suggestions: nothing is merged until a person picks the main id.
 * Pure, no DB access. Pairs below 0.65 are mostly towns shared by different clubs.
 */
import { normalizeClubName } from "./core";
import { clubPair } from "./merge";

/** One club (id) and its names and usage. */
export type ClubUsage = {
  /** Club id. */
  id: string;
  /** Profile name (newest name). */
  name: string;
  /** All names of the club with the editions they were used in, newest first. */
  names: { name: string; years: number[] }[];
  /** Editions with a cis_klub row of the id. */
  years: number[];
  /** Starts in results. */
  starts: number;
  firstYear: number;
  lastYear: number;
};

export type MergeSuggestion = {
  a: ClubUsage;
  b: ClubUsage;
  /** 0–1, higher = more similar (best pair of names). */
  score: number;
  confidence: "high" | "medium" | "low";
  /** Why: shared words, differing club-type prefixes, expanded abbreviations… */
  reasons: SuggestionReason[];
  /** The two names that matched best. */
  matched: [string, string];
  /** Editions in which both ids exist (both registered under different ids). */
  sameYears: number[];
};

export type SuggestionReason =
  "same_core" | "abbreviation" | "prefix_missing" | "prefix_conflict" | "spelling" | "subset";

/** Club-type words and abbreviations that do not identify a club on their own. */
export const CLUB_TYPE_WORDS = new Set([
  "ok",
  "kob",
  "tj",
  "sk",
  "skp",
  "sok",
  "ob",
  "oob",
  "soob",
  "sob",
  "ac",
  "ak",
  "ao",
  "fc",
  "as",
  "klub",
  "kc",
  "tk",
  "cc",
  "lo",
  "hk",
  "bk",
  "fk",
  "sc",
  "tsc",
  "team",
  "tym",
  "oddil",
  "orientacni",
  "beh",
  "atletika",
  "atleticky",
  "sportovni",
]);

/** Small words ignored when comparing. */
const STOP_WORDS = new Set(["a", "v", "z", "u", "n", "na", "nad", "pod", "the", "o", "s", "zs"]);

/** Known short forms (whole words, after normalization) → full form. */
export const ABBREVIATIONS: Record<string, string> = {
  loko: "lokomotiva",
  lok: "lokomotiva",
  slavie: "slavia",
  hk: "hradec kralove",
  kn: "kneznou",
  kneznou: "kneznou",
  c: "ceska",
  tr: "trebova",
  ct: "ceska trebova",
  uo: "usti orlici",
  vm: "vysoke myto",
  pce: "pardubice",
  pardubic: "pardubice",
  hr: "hradec",
  kr: "kralove",
};

type Parsed = { prefixes: Set<string>; core: Set<string>; coreText: string; expanded: boolean };

function words(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/**
 * Splits a name into club-type prefixes (OK, TJ, SK, K.O.B. …) and identifying words, with
 * known abbreviations expanded. "K.O.B." is read as one word "kob".
 */
export function parseClubName(name: string): Parsed {
  const joined = name
    .replace(/\b([A-Za-z])\.(?=[A-Za-z]\.)/g, "$1")
    .replace(/\b([A-Za-z]{2,3})\./g, "$1");
  const prefixes = new Set<string>();
  const core: string[] = [];
  let expanded = false;
  for (const word of words(joined)) {
    if (STOP_WORDS.has(word)) continue;
    // "OK99" → prefix "ok" + "99"
    const glued = /^(ok|tj|sk|ac|ob)(\d+)$/.exec(word);
    if (glued) {
      prefixes.add(glued[1]);
      core.push(glued[2]);
      continue;
    }
    if (CLUB_TYPE_WORDS.has(word) && !(word === "hk" && core.length > 0)) {
      prefixes.add(word);
      continue;
    }
    const full = ABBREVIATIONS[word];
    if (full && full !== word) {
      expanded = true;
      core.push(...full.split(" "));
    } else {
      core.push(word);
    }
  }
  const unique = new Set(core);
  return { prefixes, core: unique, coreText: [...unique].sort().join(" "), expanded };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) grams.add(padded.slice(i, i + 3));
  return grams;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

/** Similarity of two written names (0–1) with the reasons behind it. */
export function clubNameSimilarity(
  a: string,
  b: string,
): { score: number; reasons: SuggestionReason[] } {
  const pa = parseClubName(a);
  const pb = parseClubName(b);
  const reasons: SuggestionReason[] = [];
  if (normalizeClubName(a) === normalizeClubName(b)) {
    return { score: 1, reasons: ["spelling"] };
  }
  // Word-level match, softened by trigram similarity for typos / short forms.
  const wordScore = jaccard(pa.core, pb.core);
  const charScore = dice(trigrams(pa.coreText), trigrams(pb.coreText));
  let score = 0.6 * wordScore + 0.4 * charScore;
  if (pa.coreText && pa.coreText === pb.coreText) {
    reasons.push("same_core");
    score = 1;
  } else if (
    pa.core.size > 0 &&
    pb.core.size > 0 &&
    ([...pa.core].every((w) => pb.core.has(w)) || [...pb.core].every((w) => pa.core.has(w)))
  ) {
    reasons.push("subset");
    score = Math.max(score, 0.7);
  } else if (charScore >= 0.75) {
    reasons.push("spelling");
  }
  if (pa.expanded || pb.expanded) reasons.push("abbreviation");
  // Club-type prefixes: different (KOB vs AC) usually means different clubs in one town.
  const prefixesA = [...pa.prefixes];
  const conflict =
    pa.prefixes.size > 0 && pb.prefixes.size > 0 && !prefixesA.some((p) => pb.prefixes.has(p));
  if (conflict) {
    reasons.push("prefix_conflict");
    score *= 0.5;
  } else if (
    pa.prefixes.size !== pb.prefixes.size &&
    (pa.prefixes.size === 0 || pb.prefixes.size === 0)
  ) {
    reasons.push("prefix_missing");
    score *= 0.85;
  }
  // Name made only of a town ("Choceň") is ambiguous: many clubs share it.
  if (pa.core.size === 1 && pa.prefixes.size === 0) score *= 0.9;
  if (pb.core.size === 1 && pb.prefixes.size === 0) score *= 0.9;
  return { score: Math.round(score * 100) / 100, reasons };
}

export function confidenceOf(score: number): MergeSuggestion["confidence"] {
  return score >= 0.9 ? "high" : score >= 0.75 ? "medium" : "low";
}

/**
 * Suggested merges among existing club ids. Rejected pairs are skipped. Sorted by score, then
 * by starts involved. Candidates must share an identifying word or its first 4 letters
 * (blocking keeps it fast for ~1 000 ids).
 */
export function suggestClubMerges(
  clubs: readonly ClubUsage[],
  options: { rejected?: ReadonlySet<string>; minScore?: number; limit?: number } = {},
): MergeSuggestion[] {
  const minScore = options.minScore ?? 0.65;
  const parsed = clubs.map((club) => ({
    club,
    names: club.names.map((row) => row.name),
    years: new Set(club.years),
  }));
  const index = new Map<string, number[]>();
  parsed.forEach(({ names }, i) => {
    const tokens = new Set<string>();
    for (const name of names) {
      for (const word of parseClubName(name).core) {
        if (word.length >= 2) tokens.add(word.length > 4 ? word.slice(0, 4) : word);
      }
    }
    for (const token of tokens) {
      const list = index.get(token) ?? [];
      list.push(i);
      index.set(token, list);
    }
  });
  const seen = new Set<string>();
  const out: MergeSuggestion[] = [];
  for (const list of index.values()) {
    for (let x = 0; x < list.length; x += 1) {
      for (let y = x + 1; y < list.length; y += 1) {
        const p = parsed[list[x]];
        const q = parsed[list[y]];
        if (p.club.id === q.club.id) continue;
        const id = clubPair(p.club.id, q.club.id).join("|");
        if (seen.has(id)) continue;
        seen.add(id);
        if (options.rejected?.has(id)) continue;
        let best: { score: number; reasons: SuggestionReason[]; matched: [string, string] } | null =
          null;
        for (const nameA of p.names) {
          for (const nameB of q.names) {
            const result = clubNameSimilarity(nameA, nameB);
            if (!best || result.score > best.score) best = { ...result, matched: [nameA, nameB] };
          }
        }
        if (!best || best.score < minScore) continue;
        const [first, second, matched] =
          p.club.starts >= q.club.starts
            ? [p, q, best.matched]
            : [q, p, [best.matched[1], best.matched[0]] as [string, string]];
        out.push({
          a: first.club,
          b: second.club,
          score: best.score,
          confidence: confidenceOf(best.score),
          reasons: best.reasons,
          matched,
          sameYears: first.club.years.filter((year) => second.years.has(year)),
        });
      }
    }
  }
  out.sort(
    (p, q) =>
      q.score - p.score ||
      q.a.starts + q.b.starts - (p.a.starts + p.b.starts) ||
      p.a.name.localeCompare(q.a.name, "cs"),
  );
  return options.limit ? out.slice(0, options.limit) : out;
}
