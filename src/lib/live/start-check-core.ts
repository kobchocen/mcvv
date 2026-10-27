import { FUTURE_SKEW_MS, MAX_AGE_MS, type WebEntry } from "./ingest-core";
import { startInstant } from "./start-time";
import { isStartStation } from "./stations";

/**
 * Evidence startu (#203) – čistá logika bez DB.
 *
 * Splitmaker na stanovišti „Start“ zadá startovní číslo stejně jako u mezičasů; systém uloží
 * okamžik, kdy číslo odstartovalo. Je to jen evidence (kdo opravdu vyběhl, kandidáti DNS):
 * výsledky, OFeed ani export / import OBD s tímhle časem nepracují, dál platí plánovaný start
 * ze startovky. Proto má start vlastní tabulky (`mcvv_start_check`, `mcvv_start_check_entry`)
 * a do `mcvv_split` se nikdy nezapisuje.
 */

export type StartOutcome = "applied" | "duplicate" | "rejected" | "replaced" | "deleted";

/** Stavy, ve kterých zápis „vlastní“ řádek v mcvv_start_check. */
export const START_OWNING: StartOutcome[] = ["applied"];

export const START_MANUAL_SOURCE = "admin";
export const START_WEB_SOURCE = "web";

/** Rozdělí dávku z webového klienta na zápisy startu a mezičasů (pořadí zůstává). */
export function partitionStartEntries(entries: readonly WebEntry[]): {
  start: WebEntry[];
  splits: WebEntry[];
} {
  const start: WebEntry[] = [];
  const splits: WebEntry[] = [];
  for (const entry of entries) (isStartStation(entry.split) ? start : splits).push(entry);
  return { start, splits };
}

export type StartCheckResult = { ok: true } | { ok: false; reason: "future" | "stale" };

/**
 * Okamžik startu ze zařízení: odmítne jen nesmysly (z budoucnosti, starší než 24 h).
 * Start dřív nebo později než podle startovky je v pořádku – právě to se eviduje.
 */
export function checkStartPunch(punchedAt: number, now: Date): StartCheckResult {
  if (punchedAt > now.getTime() + FUTURE_SKEW_MS) return { ok: false, reason: "future" };
  if (punchedAt < now.getTime() - MAX_AGE_MS) return { ok: false, reason: "stale" };
  return { ok: true };
}

/** Odchylka skutečného startu od plánovaného v celých sekundách (+ = později). */
export function startOffsetSeconds(
  startedAt: Date,
  zero: Date,
  bib: number,
  intervalS: number,
): number {
  return Math.round((startedAt.getTime() - startInstant(zero, bib, intervalS).getTime()) / 1000);
}

/** `+0:05`, `-1:10`, `0:00` – odchylka pro přehled a klienta. */
export function formatOffset(seconds: number): string {
  const sign = seconds > 0 ? "+" : seconds < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(seconds));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

/** Webový zápis: první vyhrává (dvojí zadání téhož čísla = duplicita, nic se nepřepíše). */
export function decideStartWrite(existing: { startedAt: Date } | null): "insert" | "duplicate" {
  return existing ? "duplicate" : "insert";
}

/** Zápis vlastní řádek startu, když ho vytvořil a čas sedí (stejně jako u mezičasů). */
export function ownsStart(
  entry: { outcome: string; startedAt: Date | null },
  row: { startedAt: Date } | null,
): boolean {
  return (
    row !== null &&
    entry.startedAt !== null &&
    START_OWNING.includes(entry.outcome as StartOutcome) &&
    entry.startedAt.getTime() === row.startedAt.getTime()
  );
}

export type StartFilter = "all" | "started" | "missing" | "unknown";

export function parseStartFilter(raw: string | null | undefined): StartFilter {
  return raw === "started" || raw === "missing" || raw === "unknown" ? raw : "all";
}

export type StartListRow = {
  bib: number;
  name: string | null;
  club: string | null;
  categoryId: string | null;
};

export type StartRecord = {
  bib: number;
  startedAt: Date;
  source: string;
  userId: number | null;
};

export type StartOverviewRow = StartListRow & {
  /** Číslo je ve startovce ročníku. */
  known: boolean;
  planned: Date;
  record: StartRecord | null;
  /** Odchylka od plánovaného startu (s), jen pro zobrazení. */
  offsetS: number | null;
};

export type StartSummary = {
  /** Čísla ve startovce. */
  total: number;
  started: number;
  /** Ve startovce bez záznamu startu (kandidáti DNS). */
  missing: number;
  /** Záznam startu pro číslo, které ve startovce není. */
  unknown: number;
};

/**
 * Spojí startovku se záznamy startu. Řádky ze startovky podle čísla, záznamy pro neznámá
 * čísla na konec. Duplicitní čísla ve startovce (chyba startovky) se ukážou jednou.
 */
export function buildStartOverview(
  startList: readonly StartListRow[],
  records: readonly StartRecord[],
  ctx: { zero: Date; intervalS: number },
): { rows: StartOverviewRow[]; summary: StartSummary } {
  const byBib = new Map(records.map((record) => [record.bib, record]));
  const seen = new Set<number>();
  const rows: StartOverviewRow[] = [];
  const row = (base: StartListRow, known: boolean): StartOverviewRow => {
    const record = byBib.get(base.bib) ?? null;
    return {
      ...base,
      known,
      planned: startInstant(ctx.zero, base.bib, ctx.intervalS),
      record,
      offsetS: record
        ? startOffsetSeconds(record.startedAt, ctx.zero, base.bib, ctx.intervalS)
        : null,
    };
  };
  for (const entry of [...startList].sort((a, b) => a.bib - b.bib)) {
    if (seen.has(entry.bib)) continue;
    seen.add(entry.bib);
    rows.push(row(entry, true));
  }
  const unknown = records
    .filter((record) => !seen.has(record.bib))
    .sort((a, b) => a.bib - b.bib)
    .map((record) => row({ bib: record.bib, name: null, club: null, categoryId: null }, false));
  const known = rows.length;
  const started = rows.filter((r) => r.record).length;
  return {
    rows: [...rows, ...unknown],
    summary: { total: known, started, missing: known - started, unknown: unknown.length },
  };
}

export function filterStartRows(
  rows: readonly StartOverviewRow[],
  filter: StartFilter,
  query = "",
): StartOverviewRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === "started" && !(row.known && row.record)) return false;
    if (filter === "missing" && !(row.known && !row.record)) return false;
    if (filter === "unknown" && row.known) return false;
    if (!q) return true;
    return (
      String(row.bib) === q ||
      (row.name ?? "").toLowerCase().includes(q) ||
      (row.club ?? "").toLowerCase().includes(q)
    );
  });
}

/** Snímek smazaných záznamů do auditu: `[číslo, ISO startu, zdroj]` podle čísla. */
export function snapshotStarts(records: readonly StartRecord[]): (string | number)[][] {
  return [...records]
    .sort((a, b) => a.bib - b.bib)
    .map((record) => [record.bib, record.startedAt.toISOString(), record.source]);
}

/** Očekávaný stav z formuláře (ochrana proti souběžné změně): ms epoch nebo prázdné. */
export function parseExpectedStart(raw: string | null | undefined): number | null | undefined {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  if (!/^\d{1,15}$/.test(value)) return undefined;
  return Number(value);
}

export function expectedMatches(
  expected: number | null,
  current: { startedAt: Date } | null,
): boolean {
  if (expected === null) return current === null;
  return current !== null && current.startedAt.getTime() === expected;
}
