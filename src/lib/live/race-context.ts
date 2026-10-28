import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { raceStartFor } from "@/lib/race/phase";

import { startOffsetLimitFromSetting } from "./splits-screen-core";
import { DEFAULT_START_INTERVAL_S } from "./start-time";
import { LIVE_STATIONS_KEY, parseStations, type Station } from "./stations";

export const LIVE_ZERO_OVERRIDE_KEY = "live_zero_override";
/** Práh odchylky na Startu v sekundách (#187, Q80); chybí → 2 min. */
export const LIVE_START_OFFSET_LIMIT_KEY = "live_start_offset_limit";

export type RaceContext = {
  year: number;
  /** Nula závodu (start čísla 1 a 601). */
  zero: Date;
  intervalS: number;
  /** Nula je přepsaná pro zkoušku nanečisto. */
  zeroOverridden: boolean;
  /** Skutečná nula ročníku (den závodu 10:15) bez ohledu na zkušební nulu. */
  officialZero: Date;
  raceDate: Date | null;
  /** Práh „víc než … před / po plánu“ na Startu (sekundy). */
  startLimitS: number;
};

/** ISO s offsetem nebo prázdné; nesmysl → null. */
export function parseZeroOverride(raw: string | null | undefined): Date | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function getRaceContext(): Promise<RaceContext> {
  const current = await currentRaceYear();
  const [edition, override, startLimit] = await Promise.all([
    current.editionId
      ? prisma.edition.findUnique({
          where: { id: current.editionId },
          select: { startInterval: true },
        })
      : null,
    prisma.setting.findUnique({ where: { key: LIVE_ZERO_OVERRIDE_KEY }, select: { text: true } }),
    prisma.setting.findUnique({
      where: { key: LIVE_START_OFFSET_LIMIT_KEY },
      select: { text: true },
    }),
  ]);
  const overrideZero = parseZeroOverride(override?.text);
  const officialZero = raceStartFor(current.raceDate, current.year);
  return {
    year: current.year,
    zero: overrideZero ?? officialZero,
    officialZero,
    intervalS: edition?.startInterval || DEFAULT_START_INTERVAL_S,
    zeroOverridden: overrideZero !== null,
    raceDate: current.raceDate,
    startLimitS: startOffsetLimitFromSetting(startLimit?.text),
  };
}

export async function getStations(): Promise<Station[]> {
  const row = await prisma.setting.findUnique({
    where: { key: LIVE_STATIONS_KEY },
    select: { text: true },
  });
  return parseStations(row?.text);
}
