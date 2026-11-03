/** Rozpis (race notice) helpers – pure, no DB access. */

import { pragueCivil } from "@/lib/slots/core";
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

/** Weekday and calendar date, e.g. cs "st 2. 12." / "st 2. 12. 2026", en "Wed 2 Dec" / "Wed 2 December 2026". */
function formatCivilDate(
  civil: { year: number; month: number; day: number },
  locale: string,
  withYear: boolean,
): string {
  const weekday = new Date(Date.UTC(civil.year, civil.month - 1, civil.day)).getUTCDay();
  const parts =
    locale === "en"
      ? [
          EN_WEEKDAYS[weekday],
          String(civil.day),
          withYear ? EN_MONTHS[civil.month - 1] : EN_MONTHS[civil.month - 1]?.slice(0, 3),
          ...(withYear ? [String(civil.year)] : []),
        ]
      : [
          CS_WEEKDAYS[weekday],
          `${civil.day}.`,
          `${civil.month}.`,
          ...(withYear ? [String(civil.year)] : []),
        ];
  return parts.join(NBSP);
}

/** Calendar parts of a DATE column (stored as UTC midnight). */
function dateColumnCivil(date: Date) {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/**
 * Online deadline for the free-entry sentence (`prihl_datum`, a calendar date):
 * cs "st 2. 12. 2026", en "Wed 2 December 2026", joined by non-breaking spaces.
 */
export function formatFreeEntryDeadline(
  date: Date | null | undefined,
  locale: string,
): string | null {
  return date ? formatCivilDate(dateColumnCivil(date), locale, true) : null;
}

/** Race day in the Přihlášky section (Q416): cs "ne 6. 12.", en "Sun 6 Dec". */
export function formatRaceDayShort(date: Date | null | undefined, locale: string): string | null {
  return date ? formatCivilDate(dateColumnCivil(date), locale, false) : null;
}

/**
 * End of online (standard) entries in the Přihlášky section (Q414). `end` is the exclusive end
 * of the standard term, so the last minute is shown: long cs "st 2. 12. 2026 23:59",
 * en "Wed 2 December 2026, 23:59"; short cs "st 2. 12.", en "Wed 2 Dec".
 */
export function formatOnlineDeadline(
  end: Date | null | undefined,
  locale: string,
): { long: string; short: string } | null {
  if (!end) {
    return null;
  }
  const last = pragueCivil(new Date(end.getTime() - 1000));
  const date = formatCivilDate(last, locale, true);
  const clock = `${last.hour}:${String(last.minute).padStart(2, "0")}`;
  return {
    long: locale === "en" ? `${date},${NBSP}${clock}` : `${date}${NBSP}${clock}`,
    short: formatCivilDate(last, locale, false),
  };
}
