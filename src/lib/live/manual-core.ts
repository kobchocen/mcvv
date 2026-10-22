import { parsePragueLocal } from "./admin-core";
import { MAX_BIB, MAX_RACE_SECONDS } from "./ingest-core";
import { startInstant } from "./start-time";
import { FINISH_SPLIT, isSplitCode } from "./stations";
import { isoWithOffset } from "@/lib/ofeed/iof-xml";

/**
 * Ruční zápis a oprava mezičasů adminem (návrh (c)) – čistá logika bez DB.
 *
 * Ruční zápis je vědomé přebití pravidla „první vyhrává“: přepíše i existující hodnotu
 * (s povinným důvodem), v deníku má `source: "admin"`, a proto ho OBD (ani s
 * `applyCorrections`) ani web už nepřepíšou.
 */

export const MANUAL_SOURCE = "admin";
/** `mcvv_split.autor` ručního zápisu (max. 8 znaků). */
export const MANUAL_AUTHOR = "admin";
export const MANUAL_REASON_MAX = 200;

/** Čas od startu: `m:ss`, `mm:ss`, `h:mm:ss` nebo celé sekundy. Mimo 0–6 h → null. */
export function parseRaceTime(raw: string | null | undefined): number | null {
  const value = (raw ?? "").trim();
  let seconds: number;
  if (/^\d{1,5}$/.test(value)) {
    seconds = Number(value);
  } else {
    const match = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/.exec(value);
    if (!match) return null;
    const [h, m, s] = [Number(match[1] ?? 0), Number(match[2]), Number(match[3])];
    if (s > 59 || (match[1] !== undefined && m > 59)) return null;
    seconds = h * 3600 + m * 60 + s;
  }
  return seconds >= 0 && seconds <= MAX_RACE_SECONDS ? seconds : null;
}

/**
 * Denní čas průchodu `hh:mm[:ss]` (Europe/Prague, den nuly) → sekundy od startu čísla.
 * Hodí se pro papírové zápisy ze stanovišť. Před startem nebo nad 6 h → null.
 */
export function clockToRaceTime(
  raw: string | null | undefined,
  zero: Date,
  bib: number,
  intervalS: number,
): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((raw ?? "").trim());
  if (!match) return null;
  const day = isoWithOffset(zero).slice(0, 10);
  const at = parsePragueLocal(
    `${day}T${match[1].padStart(2, "0")}:${match[2]}${match[3] ? `:${match[3]}` : ""}`,
  );
  if (!at) return null;
  const seconds = Math.floor((at.getTime() - startInstant(zero, bib, intervalS).getTime()) / 1000);
  return seconds >= 0 && seconds <= MAX_RACE_SECONDS ? seconds : null;
}

export function isValidBib(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_BIB;
}

/** Splity, které smí admin ručně zapsat: stanoviště + cíl. */
export function isManualSplit(split: string, stationCodes: readonly string[]): boolean {
  return isSplitCode(split) && (split === FINISH_SPLIT || stationCodes.includes(split));
}

/** Důvod ruční změny: jeden řádek, oříznutý. */
export function normalizeReason(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MANUAL_REASON_MAX);
}

/** Očekávaná (zobrazená) hodnota z formuláře: prázdné = řádek neexistoval. */
export function parseExpected(raw: string | null | undefined): number | null | undefined {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  if (!/^\d{1,5}$/.test(value)) return undefined;
  return Number(value);
}

/**
 * Pořadí časů jednoho čísla: mezičasy v pořadí kódů musí růst a cíl musí být poslední.
 * Vrací kódy splitů, jejichž čas není větší než čas předchozího splitu.
 */
export function orderProblems(times: Readonly<Record<string, number>>): string[] {
  const codes = Object.keys(times).sort((a, b) =>
    a === FINISH_SPLIT ? 1 : b === FINISH_SPLIT ? -1 : a.localeCompare(b),
  );
  const problems: string[] = [];
  for (let i = 1; i < codes.length; i++) {
    if (times[codes[i]] <= times[codes[i - 1]]) problems.push(codes[i]);
  }
  return problems;
}

/** `existing=123` z poznámky konfliktu (čas v mcvv_split v okamžiku konfliktu). */
export function conflictExistingTime(note: string | null | undefined): number | null {
  const match = /(?:^|;)existing=(\d+)/.exec(note ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * Konflikt jde přijmout jen tehdy, když v mcvv_split pořád je hodnota, proti které vznikl.
 * Jinak (mezitím ruční oprava, smazání, jiný konflikt) by „Přijmout“ přepsal novější stav.
 */
export function conflictStillCurrent(
  note: string | null | undefined,
  current: { time: number } | null,
): boolean {
  const existing = conflictExistingTime(note);
  if (existing === null) return current === null;
  return current !== null && current.time === existing;
}
