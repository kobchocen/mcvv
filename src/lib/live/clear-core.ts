import { FINISH_SPLIT, isSplitCode, type Station } from "./stations";

/**
 * „Vyčistit mezičasy ročníku“ (Q31, Q32) – čistá logika bez DB: filtr, potvrzení a ochrana
 * v den závodu. Hromadné mazání je zakázané od skutečné nuly ročníku (den závodu v nulu ročníku,
 * zkušební nula se nebere v úvahu); jednotlivé opravy jdou vždy (editace mezičasů).
 */

/** Zdroj zápisu v deníku `mcvv_split_entry.source`. */
export const CLEAR_SOURCES = ["web", "obd", "admin"] as const;
export type ClearSourceKind = (typeof CLEAR_SOURCES)[number];

export type ClearSource = { kind: "all" } | { kind: "source"; source: ClearSourceKind };

export type ClearFilter = {
  /** Kódy splitů (1–9), vždy aspoň jeden, seřazené. */
  splits: string[];
  source: ClearSource;
};

/** Hodnota `<select name="source">`: `all`, `web`, `obd` (historické zápisy klienta OBD) nebo `admin`. */
export function parseClearSource(raw: string | null | undefined): ClearSource | null {
  const value = (raw ?? "all").trim() || "all";
  if (value === "all") return { kind: "all" };
  if ((CLEAR_SOURCES as readonly string[]).includes(value)) {
    return { kind: "source", source: value as ClearSourceKind };
  }
  return null;
}

export function formatClearSource(source: ClearSource): string {
  if (source.kind === "all") return "all";
  return source.source;
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

/** Q32: hromadné vyčištění je zakázané od skutečné nuly ročníku (nula ročníku v den závodu) dál. */
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

/**
 * Záznamy stanic v cíli (#366, mcvv_finish_punch / mcvv_finish_bib) se mažou, když výběr
 * zahrnuje cíl (split 9) a zdroj je „vše“. Filtr zdroje (web / OBD / admin) míří na zápisy
 * deníku mezičasů, stanice cíle mají vlastní zdroj – s konkrétním zdrojem se proto nemažou.
 * Bez smazání by přepočet cíle split 9 z ponechaných kliků a čísel znovu vytvořil.
 */
export function clearsFinishRecords(filter: ClearFilter): boolean {
  return filter.source.kind === "all" && filter.splits.includes(FINISH_SPLIT);
}

export type FinishPunchSnapshotRow = {
  entryKey: string;
  punchedAt: Date;
  source: string;
  deleted: boolean;
  note: string | null;
  userId: number | null;
  createdAt: Date;
};

export type FinishBibSnapshotRow = {
  entryKey: string;
  bib: number;
  readAt: Date;
  sortKey: number;
  source: string;
  deleted: boolean;
  note: string | null;
  userId: number | null;
  createdAt: Date;
};

/**
 * Snímek smazaných kliků stopek do auditu:
 * `[entryKey, punchedAt ISO, zdroj, smazáno 0/1, poznámka, userId, created ISO]`, podle času.
 */
export function snapshotFinishPunches(
  rows: readonly FinishPunchSnapshotRow[],
): (string | number | null)[][] {
  return [...rows]
    .sort(
      (a, b) =>
        a.punchedAt.getTime() - b.punchedAt.getTime() || a.entryKey.localeCompare(b.entryKey),
    )
    .map((row) => [
      row.entryKey,
      row.punchedAt.toISOString(),
      row.source,
      row.deleted ? 1 : 0,
      row.note,
      row.userId,
      row.createdAt.toISOString(),
    ]);
}

/**
 * Snímek smazaných čísel ze stanice čísel do auditu:
 * `[entryKey, číslo, readAt ISO, pořadí, zdroj, smazáno 0/1, poznámka, userId, created ISO]`,
 * podle pořadí.
 */
export function snapshotFinishBibs(
  rows: readonly FinishBibSnapshotRow[],
): (string | number | null)[][] {
  return [...rows]
    .sort((a, b) => a.sortKey - b.sortKey || a.entryKey.localeCompare(b.entryKey))
    .map((row) => [
      row.entryKey,
      row.bib,
      row.readAt.toISOString(),
      row.sortKey,
      row.source,
      row.deleted ? 1 : 0,
      row.note,
      row.userId,
      row.createdAt.toISOString(),
    ]);
}

/** Klíč řádku mcvv_split pro párování se zápisy v deníku. */
export function splitRowKey(row: { split: string; bib: number; time: number }): string {
  return `${row.split}:${row.bib}:${row.time}`;
}
