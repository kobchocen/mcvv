import { DEFAULT_START_MODEL, startSlot } from "@/lib/race/start-time";

/**
 * Startovní čas z čísla pro živé moduly (ingest, online výsledky, mezičasy, speaker, start,
 * OFeed) – bez DB. Pravidlo i hranici bere ze společného modelu startu ročníku (#114,
 * `src/lib/race/start-time.ts`):
 *
 *   n' = číslo >= první číslo 2. startu ? číslo − (první číslo 2. startu − 1) : číslo
 *   start = nula + interval · (n' − 1)
 *
 * První číslo 2. startu je `st_druhy_od` ročníku (`RaceContext.secondStartFrom`), výchozí 601.
 * Čísla 1 a `secondStartFrom` startují současně (dva paralelní starty).
 */
export const DEFAULT_START_INTERVAL_S = DEFAULT_START_MODEL.intervalSeconds;
/** Výchozí první číslo 2. startu, když ročník nemá model (`DEFAULT_START_MODEL`). */
export const DEFAULT_SECOND_START_FROM = DEFAULT_START_MODEL.secondStartFrom;

export function startOffsetSeconds(
  bib: number,
  intervalS: number,
  secondStartFrom: number,
): number {
  if (!Number.isInteger(bib) || bib < 1) {
    throw new RangeError(`Invalid bib ${bib}`);
  }
  const slot = startSlot({ ...DEFAULT_START_MODEL, secondStartFrom }, bib);
  return intervalS * (slot - 1);
}

export function startInstant(
  zero: Date,
  bib: number,
  intervalS: number,
  secondStartFrom: number,
): Date {
  return new Date(zero.getTime() + startOffsetSeconds(bib, intervalS, secondStartFrom) * 1000);
}

/** Celé sekundy od individuálního startu (zaokrouhleno dolů jako legacy `time() − start`). */
export function secondsSinceStart(
  zero: Date,
  bib: number,
  at: Date,
  intervalS: number,
  secondStartFrom: number,
): number {
  return Math.floor(
    (at.getTime() - startInstant(zero, bib, intervalS, secondStartFrom).getTime()) / 1000,
  );
}

/** `m:ss` jako legacy zobrazení mezičasu. */
export function formatRaceTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(seconds));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}
