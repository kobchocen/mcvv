/**
 * Loaders for the public club-entrants page (#352).
 * Only the fields already shown on /prihlaseni-zavodnici; no payment or entry status.
 */
import { cache } from "react";

import { clubKey } from "@/lib/clubs/core";
import { prisma } from "@/lib/db/client";
import { bestRaceTimes, countPastStarts } from "@/lib/entries/starts";
import { validRegistrationIds } from "@/lib/entries/status";
import { currentRaceYear } from "@/lib/entries/year";

import {
  groupPublicEntrants,
  resolveClubAmongEntrants,
  toPublicEntrant,
  uniqueClubsFromEntrants,
  type PublicEntrant,
  type PublicEntrantCategory,
} from "./club-entrants-core";

export * from "./club-entrants-core";

/** Confirmed/paid public entrants of the current race year (same set as /prihlaseni-zavodnici). */
export const loadYearPublicEntrants = cache(async function loadYearPublicEntrants(): Promise<{
  year: number;
  entrants: PublicEntrant[];
}> {
  const raceYear = await currentRaceYear();
  const year = raceYear.year;
  const validIds = await validRegistrationIds(year);
  const lines = await prisma.registrationLine.findMany({
    where: { year, registrationId: { in: [...validIds] } },
    include: {
      runner: { select: { name: true, nationality: true } },
      club: { select: { name: true } },
      category: { select: { name: true, sort: true } },
    },
  });
  const runnerIds = [...new Set(lines.map((line) => line.runnerId))];
  const [startsById, recordsById] = await Promise.all([
    countPastStarts(runnerIds, year),
    bestRaceTimes(runnerIds),
  ]);
  return {
    year,
    entrants: lines.map((line) => toPublicEntrant(line, startsById, recordsById)),
  };
});

export type ClubYearEntrantsResult =
  | { status: "not-found" }
  | { status: "redirect"; canonical: string }
  | {
      status: "ok";
      year: number;
      clubId: string;
      clubName: string;
      canonical: string;
      categories: PublicEntrantCategory[];
      total: number;
    };

export const loadClubYearEntrants = cache(async function loadClubYearEntrants(
  slug: string,
  locale: string,
): Promise<ClubYearEntrantsResult> {
  const decoded = decodeURIComponent(slug).trim();
  if (!decoded) return { status: "not-found" };

  const { year, entrants } = await loadYearPublicEntrants();
  const club = resolveClubAmongEntrants(decoded, uniqueClubsFromEntrants(entrants));
  if (!club) return { status: "not-found" };
  if (decoded !== club.canonical) return { status: "redirect", canonical: club.canonical };

  const clubEntrants = entrants.filter((row) => clubKey(row.clubId) === club.clubId);
  if (clubEntrants.length === 0) return { status: "not-found" };

  return {
    status: "ok",
    year,
    clubId: club.clubId,
    clubName: club.clubName,
    canonical: club.canonical,
    categories: groupPublicEntrants(clubEntrants, locale),
    total: clubEntrants.length,
  };
});
