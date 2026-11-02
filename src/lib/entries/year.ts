import { cache } from "react";

import { zonedCivilToUtc } from "@/lib/date/race-schedule";
import { prisma } from "@/lib/db/client";
import { startModelFromEdition, type StartModel } from "@/lib/race/start-time";

export function registrationDeadlineEnd(deadline: Date | null | undefined): Date | null {
  if (!deadline) {
    return null;
  }
  return zonedCivilToUtc(
    deadline.getUTCFullYear(),
    deadline.getUTCMonth() + 1,
    deadline.getUTCDate(),
    23,
    59,
    59,
  );
}

/** Latest edition; memoised per request (homepage page + template both need it). */
export const currentRaceYear = cache(async function currentRaceYear(): Promise<{
  year: number;
  deadline: Date | null;
  open: boolean;
  raceDate: Date | null;
  /** Edition number (mcvv_info.id = ročník), null when no edition exists. */
  editionId: number | null;
  /** Start model of the edition (zero, interval, second start); defaults without an edition. */
  startModel: StartModel;
}> {
  const latest = await prisma.edition.findFirst({
    orderBy: { id: "desc" },
    select: {
      date: true,
      id: true,
      regDeadline: true,
      startZeroSeconds: true,
      startInterval: true,
      secondStartFrom: true,
    },
  });
  const year = latest?.date.getUTCFullYear() ?? latest?.id ?? new Date().getFullYear();
  const deadline = latest?.regDeadline ?? null;
  const end = registrationDeadlineEnd(deadline);
  const open = !end || Date.now() <= end.getTime();
  return {
    year,
    deadline,
    open,
    raceDate: latest?.date ?? null,
    editionId: latest?.id ?? null,
    startModel: startModelFromEdition(latest),
  };
});

/** Start model of the edition held in `year` (zero, interval, second start); defaults if none. */
export async function startModelForYear(year: number): Promise<StartModel> {
  const edition = await prisma.edition.findFirst({
    where: {
      date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
    },
    orderBy: { id: "desc" },
    select: { startZeroSeconds: true, startInterval: true, secondStartFrom: true },
  });
  return startModelFromEdition(edition);
}

/** First edition was held in 1993 (edition 34 = 2026). */
export const FIRST_EDITION_YEAR = 1993;

/** Edition number (ročník) of the current race year; derived from the year when unknown. */
export function editionNumber(current: { year: number; editionId: number | null }): number {
  return current.editionId ?? current.year - FIRST_EDITION_YEAR + 1;
}
