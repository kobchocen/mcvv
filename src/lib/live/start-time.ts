import { DEFAULT_START_MODEL, startOffsetFromZero, type StartModel } from "@/lib/race/start-time";

/**
 * Startovní čas z čísla pro živé moduly (ingest, online výsledky, mezičasy, speaker, start)
 * – bez DB. Pravidlo i hranici bere ze společného modelu startu ročníku
 * (`src/lib/race/start-time.ts`, nula pořadatelů #382):
 *
 *   n' = číslo >= první číslo 2. startu ? číslo − (první číslo 2. startu − 1) : číslo
 *   nula' = n' je ve slotech 1–40 ? nula pořadatelů : nula ročníku
 *   start = nula' + interval · (n' − 1)
 *
 * První číslo 2. startu je `st_druhy_od` ročníku (`RaceContext.secondStartFrom`), výchozí 601.
 * Čísla 1 a `secondStartFrom` startují současně. Pořadatelé v rozsahu slotů 1–40 mají
 * vlastní nulu; posun vůči nule ročníku je `organizerShiftSeconds` (7:45 − 10:15 = −9 000).
 * Když posun chybí nebo je 0, platí jen nula ročníku (starší testy a výjimky).
 */
export const DEFAULT_START_INTERVAL_S = DEFAULT_START_MODEL.intervalSeconds;
/** Výchozí první číslo 2. startu, když ročník nemá model (`DEFAULT_START_MODEL`). */
export const DEFAULT_SECOND_START_FROM = DEFAULT_START_MODEL.secondStartFrom;

/** Model, ve kterém je nula ročníku 0 a nula pořadatelů je posun vůči ní. */
export function liveStartModel(
  intervalS: number,
  secondStartFrom: number,
  organizerShiftSeconds = 0,
): StartModel {
  return {
    zeroSeconds: 0,
    intervalSeconds: intervalS,
    secondStartFrom,
    organizerZeroSeconds: organizerShiftSeconds,
  };
}

export function startOffsetSeconds(
  bib: number,
  intervalS: number,
  secondStartFrom: number,
  organizerShiftSeconds = 0,
): number {
  if (!Number.isInteger(bib) || bib < 1) {
    throw new RangeError(`Invalid bib ${bib}`);
  }
  return startOffsetFromZero(
    liveStartModel(intervalS, secondStartFrom, organizerShiftSeconds),
    bib,
  ) as number;
}

export function startInstant(
  zero: Date,
  bib: number,
  intervalS: number,
  secondStartFrom: number,
  organizerShiftSeconds = 0,
): Date {
  return new Date(
    zero.getTime() +
      startOffsetSeconds(bib, intervalS, secondStartFrom, organizerShiftSeconds) * 1000,
  );
}

/** Celé sekundy od individuálního startu (zaokrouhleno dolů jako legacy `time() − start`). */
export function secondsSinceStart(
  zero: Date,
  bib: number,
  at: Date,
  intervalS: number,
  secondStartFrom: number,
  organizerShiftSeconds = 0,
): number {
  return Math.floor(
    (at.getTime() -
      startInstant(zero, bib, intervalS, secondStartFrom, organizerShiftSeconds).getTime()) /
      1000,
  );
}

/** `m:ss` jako legacy zobrazení mezičasu. */
export function formatRaceTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(seconds));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}
