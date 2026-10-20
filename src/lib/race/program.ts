/** Rozpis (race notice) helpers – pure, no DB access. */

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
