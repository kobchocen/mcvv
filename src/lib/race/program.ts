/** Rozpis (race notice) helpers – pure, no DB access. */

import type { StatSlug } from "@/lib/stats/core";

/** Edition used when the current one has no Rozpis data yet (34. ročník, 2026). */
export const FALLBACK_ROZPIS_EDITION_ID = 34;

export type RozpisEditionFields = {
  date: Date | null;
  startAdultMail: number | null;
  startKidsMail: number | null;
  startAdultPlace: number | null;
  startKidsPlace: number | null;
  finAdult1: number | null;
  finVet1: number | null;
};

/** The Rozpis shows the race date, entry fees and prize money of the edition. */
export function hasRozpisData(edition: RozpisEditionFields | null | undefined): boolean {
  if (!edition?.date) {
    return false;
  }
  return [
    edition.startAdultMail,
    edition.startKidsMail,
    edition.startAdultPlace,
    edition.startKidsPlace,
    edition.finAdult1,
    edition.finVet1,
  ].every((value) => value !== null && value !== undefined);
}

/** Birth-year bound of a category in the Rozpis (age 0 = open category). */
export function categoryBirthYearBound(age: number, rozpisYear: number): number | null {
  return age === 0 ? null : rozpisYear - age;
}

/** Statistics lists (`/statistiky/[slug]`) linked from the free-entry sentence (Q417). */
export const FREE_ENTRY_LINKS = {
  winners: "vitezove",
  veterans: "veterani",
} as const satisfies Record<string, StatSlug>;

const NBSP = "\u00A0";
const CS_WEEKDAYS = ["ne", "po", "út", "st", "čt", "pá", "so"];
const EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Online deadline for the free-entry sentence (`prihl_datum`, a calendar date):
 * cs "st 2. 12. 2026", en "Wed 2 December 2026", joined by non-breaking spaces.
 */
export function formatFreeEntryDeadline(
  date: Date | null | undefined,
  locale: string,
): string | null {
  if (!date) {
    return null;
  }
  const weekday = date.getUTCDay();
  const day = date.getUTCDate();
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  const parts =
    locale === "en"
      ? [EN_WEEKDAYS[weekday], String(day), EN_MONTHS[month], String(year)]
      : [CS_WEEKDAYS[weekday], `${day}.`, `${month + 1}.`, String(year)];
  return parts.join(NBSP);
}
