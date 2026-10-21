/**
 * Startovní čas z čísla – legacy pravidlo 1:1 (revize kap. 3.2), bez DB.
 *
 *   nula = 10:15:00 Europe/Prague v den závodu, interval 15 s,
 *   n' = číslo > 600 ? číslo − 600 : číslo, start = nula + interval · (n' − 1).
 *
 * Čísla 1 a 601 startují současně (dva paralelní starty). Až vznikne společný modul
 * startovních časů (#114), nahradí tenhle helper; vstupy i výstupy jsou stejné.
 */
export const SECOND_WAVE_AFTER = 600;
export const DEFAULT_START_INTERVAL_S = 15;

export function startOffsetSeconds(bib: number, intervalS = DEFAULT_START_INTERVAL_S): number {
  if (!Number.isInteger(bib) || bib < 1) {
    throw new RangeError(`Invalid bib ${bib}`);
  }
  const n = bib > SECOND_WAVE_AFTER ? bib - SECOND_WAVE_AFTER : bib;
  return intervalS * (n - 1);
}

export function startInstant(zero: Date, bib: number, intervalS = DEFAULT_START_INTERVAL_S): Date {
  return new Date(zero.getTime() + startOffsetSeconds(bib, intervalS) * 1000);
}

/** Celé sekundy od individuálního startu (zaokrouhleno dolů jako legacy `time() − start`). */
export function secondsSinceStart(
  zero: Date,
  bib: number,
  at: Date,
  intervalS = DEFAULT_START_INTERVAL_S,
): number {
  return Math.floor((at.getTime() - startInstant(zero, bib, intervalS).getTime()) / 1000);
}

/** `m:ss` jako legacy zobrazení mezičasu. */
export function formatRaceTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(seconds));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}
