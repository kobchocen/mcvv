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
/** Odchylka startu nad hodinu je zjevně jiný den / zkouška – číslo nic neříká. */
export const START_OFFSET_LIMIT_S = 3600;

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
  /** Start: víc než hodinu před / po plánovaném startu. */
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
}): RelativeTime {
  const estimate = typeof input.serverTime !== "number";
  const diffMs = input.punchedAt - startInstant(input.zero, input.bib, input.intervalS).getTime();
  // stejné zaokrouhlení jako server: start na celé sekundy, mezičas dolů (legacy `time() − start`)
  const local = input.atStart ? Math.round(diffMs / 1000) : Math.floor(diffMs / 1000);
  const seconds = estimate ? local : (input.serverTime as number);
  if (input.atStart) {
    if (seconds <= -START_OFFSET_LIMIT_S) return { kind: "start-far-early" };
    if (seconds >= START_OFFSET_LIMIT_S) return { kind: "start-far-late" };
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
