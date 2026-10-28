/**
 * Obrazovka splitmakera (#187) – čistá logika pro zobrazení, bez prohlížečových API.
 *
 * - `recentRecords`: „Poslední zápisy“ na stanovišti, jen posledních N (seznam nebobtná);
 * - `countRecords`: počet zápisů na stanovišti a kolik je celkem odesláno (všechna stanoviště);
 * - `relativeTime`: čas od startu (mezičas) nebo odchylka od plánovaného startu (Start),
 *   ale bez nesmyslů typu `≈ -64277:00`, když je zápis před startem nebo jiný den.
 */
import { MAX_RACE_SECONDS } from "./ingest-core";
import type { SplitRecord } from "./queue-core";
import { formatOffset } from "./start-check-core";
import { formatRaceTime, startInstant } from "./start-time";

export const RECENT_LIMIT = 10;
/**
 * Práh odchylky na Startu (#187, Q80): nad jakou odchylkou od plánovaného startu se místo čísla
 * ukáže „víc než … před / po plánu“. Nastavuje admin v Živých výsledcích (klíč
 * `live_start_offset_limit` v `mcvv_setting`, uložené v sekundách); výchozí 2 minuty.
 */
export const DEFAULT_START_OFFSET_LIMIT_S = 120;
export const START_OFFSET_LIMIT_MIN_S = 1;
/** Víc než 6 h nedává smysl (to už je celý závod). */
export const START_OFFSET_LIMIT_MAX_S = 6 * 3600;

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  sec: 1,
  sek: 1,
  m: 60,
  min: 60,
  h: 3600,
  hod: 3600,
};

/**
 * Práh zadaný adminem: `90` / `90 s` (sekundy), `2 min` / `2m` / `1,5 min` (minuty),
 * `1:30` (mm:ss), `1:00:00` (h:mm:ss); jednotka za m:ss se ignoruje (`1:30 min`).
 * Mimo rozsah 1 s – 6 h nebo nesmysl → null.
 */
export function parseStartOffsetLimit(raw: string | null | undefined): number | null {
  const value = (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!value) return null;
  let seconds: number | null = null;
  const clock = /^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?(?: ?(?:min|m|h|hod)\.?)?$/.exec(value);
  if (clock) {
    const [, a, b, c] = clock;
    seconds =
      c === undefined ? Number(a) * 60 + Number(b) : Number(a) * 3600 + Number(b) * 60 + Number(c);
  } else {
    const unit = /^(\d+(?:[.,]\d+)?) ?([a-z]*)\.?$/.exec(value);
    if (unit) {
      const factor = unit[2] ? UNIT_SECONDS[unit[2]] : 1;
      if (factor) seconds = Math.round(Number(unit[1].replace(",", ".")) * factor);
    }
  }
  if (seconds === null || !Number.isFinite(seconds)) return null;
  if (seconds < START_OFFSET_LIMIT_MIN_S || seconds > START_OFFSET_LIMIT_MAX_S) return null;
  return seconds;
}

/** Uložená hodnota (sekundy) → práh; chybí / nesmysl → výchozí 2 min. */
export function startOffsetLimitFromSetting(raw: string | null | undefined): number {
  const value = (raw ?? "").trim();
  if (!/^\d+$/.test(value)) return DEFAULT_START_OFFSET_LIMIT_S;
  const seconds = Number(value);
  return seconds >= START_OFFSET_LIMIT_MIN_S && seconds <= START_OFFSET_LIMIT_MAX_S
    ? seconds
    : DEFAULT_START_OFFSET_LIMIT_S;
}

/** Čitelný práh pro obrazovku i formulář: `45 s`, `2 min`, `1:30 min`, `1:00:00 h`. */
export function formatStartOffsetLimit(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  if (s < 60) return `${s} s`;
  if (s < 3600) return s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)}:${pad(s % 60)} min`;
  const h = Math.floor(s / 3600);
  const rest = s % 3600;
  return rest === 0 ? `${h} h` : `${h}:${pad(Math.floor(rest / 60))}:${pad(rest % 60)} h`;
}

/** Records jsou seřazené od nejnovějšího (addPunch přidává na začátek). */
export function recentRecords(
  records: readonly SplitRecord[],
  station: string,
  limit = RECENT_LIMIT,
): SplitRecord[] {
  const out: SplitRecord[] = [];
  for (const r of records) {
    if (r.split !== station) continue;
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** Zápis, který se počítá jako zapsaný běžec: má číslo a není smazaný. */
function isRecorded(r: SplitRecord): boolean {
  return r.bib !== null && r.state !== "deleted" && r.state !== "draft";
}

/** Server zápis přijal a uložil (včetně neznámého čísla). */
function isSent(r: SplitRecord): boolean {
  return r.state === "applied";
}

export type RecordCounts = {
  /** Zapsaná čísla na stanovišti (bez smazaných a razítek bez čísla). */
  station: number;
  /** Z toho uloženo na serveru. */
  stationSent: number;
  /** Uloženo na serveru celkem ze všech stanovišť (tohle zařízení / obsluha). */
  totalSent: number;
};

export function countRecords(records: readonly SplitRecord[], station: string): RecordCounts {
  let stationCount = 0;
  let stationSent = 0;
  let totalSent = 0;
  for (const r of records) {
    if (!isRecorded(r)) continue;
    const sent = isSent(r);
    if (sent) totalSent += 1;
    if (r.split !== station) continue;
    stationCount += 1;
    if (sent) stationSent += 1;
  }
  return { station: stationCount, stationSent, totalSent };
}

export type RelativeTime =
  /** Zobrazitelný čas (`estimate` = odhad z hodin zařízení, ne potvrzení ze serveru). */
  | { kind: "time"; text: string; estimate: boolean }
  /** Mezičas před individuálním startem běžce. */
  | { kind: "before-start" }
  /** Mezičas delší než maximální čas závodu (typicky jiný den). */
  | { kind: "too-long" }
  /** Start: odchylka od plánovaného startu je nad prahem (`startLimitS`). */
  | { kind: "start-far-early" }
  | { kind: "start-far-late" };

export function relativeTime(input: {
  atStart: boolean;
  zero: Date;
  intervalS: number;
  bib: number;
  punchedAt: number;
  /** Čas potvrzený serverem (sekundy), pokud ho server vrátil. */
  serverTime?: number | null;
  /** Práh odchylky na Startu v sekundách (výchozí 2 min). */
  startLimitS?: number;
}): RelativeTime {
  const estimate = typeof input.serverTime !== "number";
  const diffMs = input.punchedAt - startInstant(input.zero, input.bib, input.intervalS).getTime();
  // stejné zaokrouhlení jako server: start na celé sekundy, mezičas dolů (legacy `time() − start`)
  const local = input.atStart ? Math.round(diffMs / 1000) : Math.floor(diffMs / 1000);
  const seconds = estimate ? local : (input.serverTime as number);
  if (input.atStart) {
    const limit = input.startLimitS ?? DEFAULT_START_OFFSET_LIMIT_S;
    if (seconds < -limit) return { kind: "start-far-early" };
    if (seconds > limit) return { kind: "start-far-late" };
    return { kind: "time", text: formatOffset(seconds), estimate };
  }
  if (seconds < 0) return { kind: "before-start" };
  if (seconds > MAX_RACE_SECONDS) return { kind: "too-long" };
  return { kind: "time", text: formatRaceTime(seconds), estimate };
}

/** Běžící hodiny: čas zařízení + korekce proti serveru (pokud je známá). */
export function correctedNow(deviceNow: number, offset: number | null): number {
  return deviceNow + (offset ?? 0);
}
