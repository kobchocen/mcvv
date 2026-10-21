/**
 * Merge suggestions for the admin (#104): pairs of written club names that look like the same
 * club. Only suggestions – nothing is merged until a person confirms the pair in the admin.
 * Pure, no DB access. Pairs below 0.65 are mostly towns shared by different clubs.
 */
import { normalizeClubName } from "./core";

/** One written club name (identity key) with its usage in results. */
export type ClubNameUsage = {
  key: string;
  /** Most frequent spelling of the key. */
  name: string;
  starts: number;
  firstYear: number;
  lastYear: number;
  /** Canonical club the key is already assigned to (confirmed alias), if any. */
  canonicalId?: number | null;
};

export type MergeSuggestion = {
  a: ClubNameUsage;
  b: ClubNameUsage;
  /** 0–1, higher = more similar. */
  score: number;
  confidence: "high" | "medium" | "low";
  /** Why: shared words, differing club-type prefixes, expanded abbreviations… */
  reasons: SuggestionReason[];
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

/** Canonical pair key of two identity keys (order independent). */
export function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Suggested merges among written names. Pairs already in one canonical club and rejected pairs
 * are skipped. Sorted by score, then by starts involved. Candidates must share an identifying
 * word or its first 4 letters (blocking keeps it fast for ~1 000 names).
 */
export function suggestClubMerges(
  names: readonly ClubNameUsage[],
  options: { rejected?: ReadonlySet<string>; minScore?: number; limit?: number } = {},
): MergeSuggestion[] {
  const minScore = options.minScore ?? 0.65;
  const parsed = names.map((usage) => ({ usage, parsed: parseClubName(usage.name) }));
  const index = new Map<string, number[]>();
  parsed.forEach(({ parsed: p }, i) => {
    const tokens = new Set<string>();
    for (const word of p.core) {
      if (word.length >= 2) tokens.add(word.length > 4 ? word.slice(0, 4) : word);
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
        const a = parsed[list[x]].usage;
        const b = parsed[list[y]].usage;
        const [k1, k2] = pairKey(a.key, b.key);
        const id = `${k1}|${k2}`;
        if (seen.has(id)) continue;
        seen.add(id);
        if (a.key === b.key) continue;
        if (a.canonicalId && a.canonicalId === b.canonicalId) continue;
        if (options.rejected?.has(id)) continue;
        const { score, reasons } = clubNameSimilarity(a.name, b.name);
        if (score < minScore) continue;
        const [first, second] = a.starts >= b.starts ? [a, b] : [b, a];
        out.push({ a: first, b: second, score, confidence: confidenceOf(score), reasons });
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
