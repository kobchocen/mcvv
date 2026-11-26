import { DEFAULT_RACE_ZERO_SECONDS, zonedCivilToUtc } from "@/lib/date/race-schedule";

/**
 * Model startu ročníku (#114, nula pořadatelů #382). Jediné místo, kde se počítá
 * startovní čas z čísla:
 *
 *   n' = číslo >= první číslo 2. startu ? číslo − (první číslo 2. startu − 1) : číslo
 *   nula' = n' je ve slotech 1–40 ? nula pořadatelů : nula ročníku
 *   start = nula' + interval × (n' − 1)
 *
 * Čísla 1 a 601 startují zároveň. Pořadatelé v rozsahu 1–40 / 601–640 (při výchozí
 * hranici 601) mají vlastní nulu (od 2026 výchozí 7:45); mimo ten rozsah platí nula
 * ročníku (výchozí 10:15), včetně přetékajícího pořadatele. U ročníků před 2026, kde
 * sloupec nuly pořadatelů v DB je NULL, se posun neuplatní — jinak by se změnily
 * historické startovní časy (startovka, tisk, PDF). Nulový čas je civilní čas
 * v Europe/Prague.
 */
export type StartModel = {
  /** Nulový čas v sekundách od půlnoci (10:15:00 = 36 900). */
  zeroSeconds: number;
  /** Interval mezi čísly v sekundách. */
  intervalSeconds: number;
  /** První číslo druhého startu (601). */
  secondStartFrom: number;
  /** Nula pořadatelů (sloty 1–40) v sekundách od půlnoci (7:45:00 = 27 900). */
  organizerZeroSeconds: number;
};

/** Výchozí první start pořadatelů (7:45, z hovoru k #382). */
export const DEFAULT_ORGANIZER_ZERO_SECONDS = 7 * 3600 + 45 * 60;

/**
 * Od tohoto roku je výchozí nula pořadatelů 7:45, když je sloupec v DB NULL.
 * Starší ročníky bez uložené hodnoty nemají posun (nula ročníku).
 */
export const FIRST_ORGANIZER_ZERO_YEAR = 2026;

/** Výchozí nula pořadatelů pro daný rok, když ročník nemá uloženou hodnotu. */
export function defaultOrganizerZeroSeconds(
  year: number | undefined,
  editionZeroSeconds: number,
): number {
  // Bez roku (nový / výchozí model) platí 7:45. Historické ročníky musí rok předat.
  if (year == null) return DEFAULT_ORGANIZER_ZERO_SECONDS;
  return year >= FIRST_ORGANIZER_ZERO_YEAR ? DEFAULT_ORGANIZER_ZERO_SECONDS : editionZeroSeconds;
}

/** Sloty s nulou pořadatelů – stejné jako `SPECIAL_SLOT_RANGES.organizer`. */
export const ORGANIZER_SLOT_RANGE = { from: 1, to: 40 } as const;

export const DEFAULT_START_MODEL: StartModel = {
  zeroSeconds: DEFAULT_RACE_ZERO_SECONDS,
  intervalSeconds: 15,
  secondStartFrom: 601,
  organizerZeroSeconds: DEFAULT_ORGANIZER_ZERO_SECONDS,
};

export const DEFAULT_CHAMPION_BIBS = { men: 400, women: 950 } as const;

export function startModelFromEdition(
  edition:
    | {
        startZeroSeconds?: number | null;
        startInterval?: number | null;
        secondStartFrom?: number | null;
        organizerZeroSeconds?: number | null;
        date?: Date | null;
      }
    | null
    | undefined,
  year?: number,
): StartModel {
  const organizer = edition?.organizerZeroSeconds;
  const zeroSeconds = edition?.startZeroSeconds ?? DEFAULT_START_MODEL.zeroSeconds;
  const resolvedYear = year ?? (edition?.date ? edition.date.getUTCFullYear() : undefined);
  return {
    zeroSeconds,
    intervalSeconds:
      edition?.startInterval && edition.startInterval > 0
        ? edition.startInterval
        : DEFAULT_START_MODEL.intervalSeconds,
    secondStartFrom:
      edition?.secondStartFrom && edition.secondStartFrom > 1
        ? edition.secondStartFrom
        : DEFAULT_START_MODEL.secondStartFrom,
    organizerZeroSeconds:
      organizer != null && Number.isInteger(organizer) && organizer >= 0 && organizer < 86400
        ? organizer
        : defaultOrganizerZeroSeconds(resolvedYear, zeroSeconds),
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

/** Číslo leží v rozsahu nuly pořadatelů (1–40 / 601–640 při výchozí hranici). */
export function usesOrganizerZero(model: StartModel, bib: number): boolean {
  const slot = startSlot(model, bib);
  return slot >= ORGANIZER_SLOT_RANGE.from && slot <= ORGANIZER_SLOT_RANGE.to;
}

/** Nula použitá pro dané číslo (pořadatelé vs. zbytek startovky). */
export function zeroSecondsForBib(model: StartModel, bib: number): number {
  return usesOrganizerZero(model, bib) ? model.organizerZeroSeconds : model.zeroSeconds;
}

/** Posun nuly pořadatelů vůči nule ročníku (7:45 − 10:15 = −9 000). */
export function organizerShiftSeconds(model: StartModel): number {
  return model.organizerZeroSeconds - model.zeroSeconds;
}

/** Startovní čas v sekundách od půlnoci, null pro neplatné číslo. */
export function startSecondsForBib(
  model: StartModel,
  bib: number | null | undefined,
): number | null {
  if (bib == null || !Number.isInteger(bib) || bib <= 0) {
    return null;
  }
  return zeroSecondsForBib(model, bib) + model.intervalSeconds * (startSlot(model, bib) - 1);
}

/** Posun startu vůči nule ročníku (pořadatelé typicky záporný). */
export function startOffsetFromZero(model: StartModel, bib: number): number | null {
  const seconds = startSecondsForBib(model, bib);
  return seconds == null ? null : seconds - model.zeroSeconds;
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
  const byTime = (startSecondsForBib(model, a) ?? 0) - (startSecondsForBib(model, b) ?? 0);
  return byTime || startSlot(model, a) - startSlot(model, b) || a - b;
}
