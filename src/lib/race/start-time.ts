import { zonedCivilToUtc } from "@/lib/date/race-schedule";

/**
 * Model startu ročníku (#114). Jediné místo, kde se počítá startovní čas z čísla:
 *
 *   n' = cislo >= prvni_cislo_2_startu ? cislo - (prvni_cislo_2_startu - 1) : cislo
 *   start = nula + interval * (n' - 1)
 *
 * Čísla 1 a 601 startují zároveň (dva paralelní starty). Nulový čas je civilní čas
 * v Europe/Prague, takže žádný pevný offset.
 */
export type StartModel = {
  /** Nulový čas v sekundách od půlnoci (10:15:00 = 36 900). */
  zeroSeconds: number;
  /** Interval mezi čísly v sekundách. */
  intervalSeconds: number;
  /** První číslo druhého startu (601). */
  secondStartFrom: number;
};

export const DEFAULT_START_MODEL: StartModel = {
  zeroSeconds: 10 * 3600 + 15 * 60,
  intervalSeconds: 15,
  secondStartFrom: 601,
};

export const DEFAULT_CHAMPION_BIBS = { men: 400, women: 950 } as const;

export function startModelFromEdition(
  edition:
    | {
        startZeroSeconds?: number | null;
        startInterval?: number | null;
        secondStartFrom?: number | null;
      }
    | null
    | undefined,
): StartModel {
  return {
    zeroSeconds: edition?.startZeroSeconds ?? DEFAULT_START_MODEL.zeroSeconds,
    intervalSeconds:
      edition?.startInterval && edition.startInterval > 0
        ? edition.startInterval
        : DEFAULT_START_MODEL.intervalSeconds,
    secondStartFrom:
      edition?.secondStartFrom && edition.secondStartFrom > 1
        ? edition.secondStartFrom
        : DEFAULT_START_MODEL.secondStartFrom,
  };
}

/** 1 = první start, 2 = druhý start. */
export function startSeriesForBib(model: StartModel, bib: number): 1 | 2 {
  return bib >= model.secondStartFrom ? 2 : 1;
}

/** Pořadí čísla v rámci jeho startu (n'): 1 → 1, 601 → 1, 641 → 41. */
export function startSlot(model: StartModel, bib: number): number {
  return bib >= model.secondStartFrom ? bib - (model.secondStartFrom - 1) : bib;
}

/** Číslo pro dané pořadí ve startu (inverze `startSlot`). */
export function bibForSlot(model: StartModel, series: 1 | 2, slot: number): number {
  return series === 2 ? slot + model.secondStartFrom - 1 : slot;
}

/** Startovní čas v sekundách od půlnoci, null pro neplatné číslo. */
export function startSecondsForBib(
  model: StartModel,
  bib: number | null | undefined,
): number | null {
  if (bib == null || !Number.isInteger(bib) || bib <= 0) {
    return null;
  }
  return model.zeroSeconds + model.intervalSeconds * (startSlot(model, bib) - 1);
}

export function formatClock(seconds: number): string {
  const day = ((seconds % 86400) + 86400) % 86400;
  const h = Math.floor(day / 3600);
  const m = Math.floor((day % 3600) / 60);
  const s = day % 60;
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
}

/** Startovní čas jako „HH:MM:SS“ (civilní čas Europe/Prague); "" pro číslo bez času. */
export function startTimeForBib(model: StartModel, bib: number | null | undefined): string {
  const seconds = startSecondsForBib(model, bib);
  return seconds == null ? "" : formatClock(seconds);
}

/** Okamžik startu v den závodu (UTC Date), přepočtený přes Europe/Prague. */
export function startInstantForBib(model: StartModel, raceDate: Date, bib: number): Date | null {
  const seconds = startSecondsForBib(model, bib);
  if (seconds == null) {
    return null;
  }
  return zonedCivilToUtc(
    raceDate.getUTCFullYear(),
    raceDate.getUTCMonth() + 1,
    raceDate.getUTCDate(),
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  );
}

/** "10:15" / "10:15:00" → 36 900; null pro neplatný vstup. */
export function parseClock(raw: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((raw ?? "").trim());
  if (!match) {
    return null;
  }
  const [h, m, s] = [Number(match[1]), Number(match[2]), Number(match[3] ?? "0")];
  if (h > 23 || m > 59 || s > 59) {
    return null;
  }
  return h * 3600 + m * 60 + s;
}

/** Řazení startovky podle času, obě vlny prolnuté (při shodě času dřív 1. start). */
export function compareByStart(model: StartModel, a: number, b: number): number {
  return startSlot(model, a) - startSlot(model, b) || a - b;
}
