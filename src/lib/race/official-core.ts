/**
 * Oficiální výsledky ročníku (#337, #252): náhled z cílových časů (`mcvv_split`, split 9),
 * kontrola hlavním rozhodčím, zveřejnění do `mcvv_time` a časové okno veřejných živých
 * výsledků. Čisté funkce bez DB a frameworku.
 */
import { FINISH_MAX_SECONDS, FINISH_MIN_SECONDS } from "@/lib/live/finish-core";

/** Stav zveřejnění oficiálních výsledků ročníku (`mcvv_setting`, JSON). */
export const officialPublishedKey = (year: number) => `results.official.${year}`;
/** Kontrola hlavním rozhodčím (`mcvv_setting`, JSON): váže se na otisk náhledu. */
export const officialCheckKey = (year: number) => `results.check.${year}`;
/** Ruční přebití okna živých výsledků (`mcvv_setting`, JSON `{year, mode}`). */
export const LIVE_WINDOW_KEY = "live.window";

export type OfficialStamp = {
  at: string;
  by: string;
  hash: string;
  count: number;
};

export function parseStamp(raw: string | null | undefined): OfficialStamp | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OfficialStamp>;
    if (
      typeof value.at !== "string" ||
      typeof value.by !== "string" ||
      typeof value.hash !== "string" ||
      typeof value.count !== "number"
    ) {
      return null;
    }
    return { at: value.at, by: value.by, hash: value.hash, count: value.count };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Okno veřejných živých výsledků

export type LiveWindowMode = "auto" | "open" | "closed";
export type LiveWindowState = "before" | "open" | "closed" | "published";

export function parseLiveWindow(raw: string | null | undefined, year: number): LiveWindowMode {
  if (!raw) return "auto";
  try {
    const value = JSON.parse(raw) as { year?: unknown; mode?: unknown };
    if (value.year !== year) return "auto";
    return value.mode === "open" || value.mode === "closed" ? value.mode : "auto";
  } catch {
    return "auto";
  }
}

/**
 * Stav okna: po zveřejnění oficiálních výsledků vždy zavřeno (přesměrování), jinak ruční
 * přebití admina, jinak automaticky od nuly ročníku.
 */
export function liveWindowState(input: {
  now: Date;
  raceStart: Date;
  mode: LiveWindowMode;
  published: boolean;
}): LiveWindowState {
  if (input.published) return "published";
  if (input.mode === "closed") return "closed";
  if (input.mode === "open") return "open";
  return input.now.getTime() >= input.raceStart.getTime() ? "open" : "before";
}

/** Oficiální výsledky ročníku (cíl přesměrování po zveřejnění). */
export function officialResultsPath(year: number): `/results/${number}` {
  return `/results/${year}`;
}

// ---------------------------------------------------------------------------
// Náhled a zveřejnění

export type OfficialRosterRow = {
  bib: number;
  runnerId: string;
  runnerName: string;
  clubId: string;
  clubName: string;
  categoryId: string;
};

export type OfficialRow = OfficialRosterRow & { time: number };

export type OfficialIssue =
  | { kind: "too-fast" | "too-long"; bib: number; time: number }
  | { kind: "not-on-roster"; bib: number; time: number }
  | { kind: "started-no-finish"; bib: number };

export type OfficialPreview = {
  rows: OfficialRow[];
  issues: OfficialIssue[];
  rosterCount: number;
  noFinish: number;
  hash: string;
};

/**
 * Náhled oficiálních výsledků: každý běžec startovky s cílovým časem (čistý čas od startu
 * ze startovky, pozdní starty se neopravují). Podezřelé časy a cíl bez běžce ve startovce
 * jsou upozornění pro rozhodčího; do výsledků jde jen čas běžce ze startovky.
 */
export function buildOfficialPreview(
  roster: readonly OfficialRosterRow[],
  finish: ReadonlyMap<number, number>,
  started: ReadonlySet<number> = new Set(),
): OfficialPreview {
  const rows: OfficialRow[] = [];
  const issues: OfficialIssue[] = [];
  const onRoster = new Set<number>();
  for (const runner of roster) {
    onRoster.add(runner.bib);
    const time = finish.get(runner.bib);
    if (time === undefined) {
      if (started.has(runner.bib)) issues.push({ kind: "started-no-finish", bib: runner.bib });
      continue;
    }
    if (time < FINISH_MIN_SECONDS) issues.push({ kind: "too-fast", bib: runner.bib, time });
    else if (time > FINISH_MAX_SECONDS) issues.push({ kind: "too-long", bib: runner.bib, time });
    rows.push({ ...runner, time });
  }
  for (const [bib, time] of [...finish].sort((a, b) => a[0] - b[0])) {
    if (!onRoster.has(bib)) issues.push({ kind: "not-on-roster", bib, time });
  }
  rows.sort((a, b) => a.time - b.time || a.bib - b.bib);
  return {
    rows,
    issues,
    rosterCount: roster.length,
    noFinish: roster.length - rows.length,
    hash: previewHash(rows),
  };
}

/** Otisk náhledu (FNV-1a 32 bit přes čísla, běžce, kategorie a časy). */
export function previewHash(rows: readonly OfficialRow[]): string {
  const text = [...rows]
    .sort((a, b) => a.bib - b.bib)
    .map((r) => `${r.bib}:${r.runnerId}:${r.categoryId}:${r.clubId}:${r.time}`)
    .join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${rows.length}-${hash.toString(16).padStart(8, "0")}`;
}

export type PublishBlock =
  "published" | "has_results" | "empty" | "no_check" | "stale_check" | "test_running";

/** Smí se zveřejnit? Jen po kontrole rozhodčím nad stejnými daty, jednou za ročník. */
export function publishBlock(input: {
  preview: Pick<OfficialPreview, "rows" | "hash">;
  check: OfficialStamp | null;
  published: OfficialStamp | null;
  existingResults: number;
  testRunning: boolean;
}): PublishBlock | null {
  if (input.published) return "published";
  if (input.existingResults > 0) return "has_results";
  if (input.testRunning) return "test_running";
  if (input.preview.rows.length === 0) return "empty";
  if (!input.check) return "no_check";
  if (input.check.hash !== input.preview.hash) return "stale_check";
  return null;
}
