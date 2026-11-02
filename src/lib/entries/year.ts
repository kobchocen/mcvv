import { cache } from "react";

import { zonedCivilToUtc } from "@/lib/date/race-schedule";
import { prisma } from "@/lib/db/client";
import {
  DEFAULT_OFFICE_OPENS_S,
  DEFAULT_ONSITE_UNTIL_S,
  DEFAULT_STANDARD_PAY_MAIL_S,
  registrationOpen,
  standardEnd,
  standardPayUntil,
  type Slot,
  type SlotSettings,
} from "@/lib/slots/core";
import { loadSlots } from "@/lib/slots/load";
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
  /** Termíny přihlášek (sloty) ročníku; prázdné = dosavadní chování podle uzávěrky. */
  slots: Slot[];
  /** Nastavení termínů ročníku (časy v sekundách od půlnoci, Praha). */
  slotSettings: SlotSettings;
  /** Konec standardních přihlášek (exkluzivní); null = bez uzávěrky. */
  standardEnd: Date | null;
  /** Lhůta doplatku nezaplacených standardních přihlášek. */
  standardPayUntil: Date | null;
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
      standardPayUntil: true,
      standardPayMailS: true,
      officeOpensS: true,
      onsiteUntilS: true,
    },
  });
  const year = latest?.date.getUTCFullYear() ?? latest?.id ?? new Date().getFullYear();
  const deadline = latest?.regDeadline ?? null;
  const slots = latest ? await loadSlots(year) : [];
  const slotSettings: SlotSettings = {
    regDeadline: deadline,
    standardPayUntil: latest?.standardPayUntil ?? null,
    standardPayMailS: latest?.standardPayMailS ?? DEFAULT_STANDARD_PAY_MAIL_S,
    officeOpensS: latest?.officeOpensS ?? DEFAULT_OFFICE_OPENS_S,
    onsiteUntilS: latest?.onsiteUntilS ?? DEFAULT_ONSITE_UNTIL_S,
  };
  const open = registrationOpen(slots, deadline, new Date());
  return {
    year,
    deadline,
    open,
    raceDate: latest?.date ?? null,
    editionId: latest?.id ?? null,
    startModel: startModelFromEdition(latest),
    slots,
    slotSettings,
    standardEnd: standardEnd(slots, deadline),
    standardPayUntil: standardPayUntil(slots, slotSettings),
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
