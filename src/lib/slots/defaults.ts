/**
 * Výchozí termíny ročníku, když je ještě nikdo nenastavil (odpovídá seedu migrace
 * `20261104120000_registration_slots`): standard od 1. 9. do konce dne uzávěrky, pozdní
 * přihlášky do soboty před závodem 18:00 (vypnuté), na místě v den závodu v závodní kanceláři.
 */
import {
  atDateTime,
  DEFAULT_OFFICE_OPENS_S,
  DEFAULT_ONSITE_UNTIL_S,
  standardEndFromDeadline,
  type Slot,
} from "./core";

export type EditionForSlots = {
  date: Date;
  regDeadline: Date | null;
  regOpensAt: Date | null;
  startAdultMail: number | null;
  startKidsMail: number | null;
  startAdultPlace: number | null;
  startKidsPlace: number | null;
  officeOpensS?: number | null;
  onsiteUntilS?: number | null;
};

const DAY_MS = 24 * 3600 * 1000;

/** Konec dne před závodem (sobota) v 18:00 Praha – výchozí konec pozdních přihlášek. */
function lateEndDefault(raceDate: Date): Date {
  return atDateTime(new Date(raceDate.getTime() - DAY_MS), 18 * 3600);
}

/** Termín „na místě“ z data závodu a časů závodní kanceláře. */
export function onsiteWindow(
  raceDate: Date,
  officeOpensS: number,
  onsiteUntilS: number,
): { from: Date; to: Date } {
  return { from: atDateTime(raceDate, officeOpensS), to: atDateTime(raceDate, onsiteUntilS) };
}

export function defaultSlots(edition: EditionForSlots): Slot[] {
  const year = edition.date.getUTCFullYear();
  const standardFrom = edition.regOpensAt ?? atDateTime(new Date(Date.UTC(year, 8, 1)), 0);
  const standardTo = edition.regDeadline
    ? standardEndFromDeadline(edition.regDeadline)
    : atDateTime(new Date(edition.date.getTime() - 4 * DAY_MS), 0);
  const adultMail = edition.startAdultMail ?? 100;
  const kidsMail = edition.startKidsMail ?? 50;
  const adultPlace = edition.startAdultPlace ?? adultMail * 2;
  const kidsPlace = edition.startKidsPlace ?? kidsMail * 2;
  const onsite = onsiteWindow(
    edition.date,
    edition.officeOpensS ?? DEFAULT_OFFICE_OPENS_S,
    edition.onsiteUntilS ?? DEFAULT_ONSITE_UNTIL_S,
  );
  return [
    {
      type: "early",
      from: standardFrom,
      to: standardFrom,
      active: false,
      feeAdult: adultMail,
      feeYouth: kidsMail,
      payWithinMinutes: null,
    },
    {
      type: "standard",
      from: standardFrom,
      to: standardTo,
      active: true,
      feeAdult: adultMail,
      feeYouth: kidsMail,
      payWithinMinutes: null,
    },
    {
      type: "late",
      from: standardTo,
      to: lateEndDefault(edition.date),
      active: false,
      feeAdult: adultPlace,
      feeYouth: kidsPlace,
      payWithinMinutes: 60,
    },
    {
      type: "onsite",
      ...onsite,
      active: true,
      feeAdult: adultPlace,
      feeYouth: kidsPlace,
      payWithinMinutes: null,
    },
  ];
}

/** Uložené termíny doplněné o chybějící druhy výchozími hodnotami (pořadí early → onsite). */
export function slotsWithDefaults(stored: readonly Slot[], edition: EditionForSlots): Slot[] {
  return defaultSlots(edition).map(
    (fallback) => stored.find((slot) => slot.type === fallback.type) ?? fallback,
  );
}
