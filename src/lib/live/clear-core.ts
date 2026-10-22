import { FINISH_SPLIT, isSplitCode, type Station } from "./stations";

/**
 * „Vyčistit mezičasy ročníku“ (Q31, Q32) – čistá logika bez DB: filtr, potvrzení a ochrana
 * v den závodu. Hromadné mazání je zakázané od skutečné nuly ročníku (den závodu 10:15,
 * zkušební nula se nebere v úvahu); jednotlivé opravy jdou vždy (editace mezičasů).
 */

/** Zdroj zápisu v deníku `mcvv_split_entry.source`. */
export const CLEAR_SOURCES = ["web", "obd"] as const;
export type ClearSourceKind = (typeof CLEAR_SOURCES)[number];

export type ClearSource =
  | { kind: "all" }
  | { kind: "source"; source: ClearSourceKind }
  | { kind: "token"; tokenId: number };

export type ClearFilter = {
  /** Kódy splitů (1–9), vždy aspoň jeden, seřazené. */
  splits: string[];
  source: ClearSource;
};

/** Hodnota `<select name="source">`: `all`, `web`, `obd` nebo `token:{id}`. */
export function parseClearSource(raw: string | null | undefined): ClearSource | null {
  const value = (raw ?? "all").trim() || "all";
  if (value === "all") return { kind: "all" };
  if ((CLEAR_SOURCES as readonly string[]).includes(value)) {
    return { kind: "source", source: value as ClearSourceKind };
  }
  const token = /^token:(\d{1,9})$/.exec(value);
  if (token && Number(token[1]) > 0) return { kind: "token", tokenId: Number(token[1]) };
  return null;
}

export function formatClearSource(source: ClearSource): string {
  if (source.kind === "all") return "all";
  if (source.kind === "source") return source.source;
  return `token:${source.tokenId}`;
}

/** Splity k výběru: stanoviště splitmakerů + cíl. */
export function clearableSplits(stations: Station[]): string[] {
  return [...new Set([...stations.map((s) => s.code), FINISH_SPLIT])].sort();
}

/**
 * Filtr z formuláře. Prázdný výběr splitů = všechny nabízené. Neplatný kód nebo zdroj → null.
 */
export function parseClearFilter(
  input: { splits: readonly string[]; source: string | null | undefined },
  allowedSplits: readonly string[],
): ClearFilter | null {
  const source = parseClearSource(input.source);
  if (!source) return null;
  const picked = input.splits.map((s) => s.trim()).filter(Boolean);
  if (picked.some((s) => !isSplitCode(s) || !allowedSplits.includes(s))) return null;
  const splits = [...new Set(picked.length > 0 ? picked : allowedSplits)].sort();
  if (splits.length === 0) return null;
  return { splits, source };
}

/** Potvrzení: opsaný ročník musí přesně sedět. */
export function confirmationMatches(typed: string | null | undefined, year: number): boolean {
  return (typed ?? "").trim() === String(year);
}

/** Q32: hromadné vyčištění je zakázané od skutečné nuly ročníku (10:15 v den závodu) dál. */
export function clearBlocked(now: Date, officialZero: Date): boolean {
  return now.getTime() >= officialZero.getTime();
}

export type SplitSnapshotRow = {
  bib: number;
  split: string;
  time: number;
  author: string | null;
  created: Date | null;
};

/**
 * Snímek smazaných řádků `mcvv_split` do auditu: kompaktní pole
 * `[číslo, split, čas, autor, created ISO]`, seřazené podle splitu a čísla.
 */
export function snapshotRows(rows: readonly SplitSnapshotRow[]): (string | number | null)[][] {
  return [...rows]
    .sort((a, b) => a.split.localeCompare(b.split) || a.bib - b.bib)
    .map((row) => [row.bib, row.split, row.time, row.author, row.created?.toISOString() ?? null]);
}

/** Klíč řádku mcvv_split pro párování se zápisy v deníku. */
export function splitRowKey(row: { split: string; bib: number; time: number }): string {
  return `${row.split}:${row.bib}:${row.time}`;
}
