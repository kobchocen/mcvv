import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { raceStartFor } from "@/lib/race/phase";

import { DEFAULT_DNS_GRACE_FALLBACK_S, DEFAULT_DNS_GRACE_S } from "./online-results-core";
import { durationFromSetting, startOffsetLimitFromSetting } from "./splits-screen-core";
import { DEFAULT_START_INTERVAL_S } from "./start-time";
import { LIVE_STATIONS_KEY, parseStations, type Station } from "./stations";

export const LIVE_ZERO_OVERRIDE_KEY = "live_zero_override";
/** Práh odchylky na Startu v sekundách (#187, Q80); chybí → 2 min. */
export const LIVE_START_OFFSET_LIMIT_KEY = "live_start_offset_limit";
/** Online výsledky: lhůta DNS po plánovaném startu v sekundách (Q114); chybí → 5 min. */
export const LIVE_DNS_GRACE_KEY = "live_dns_grace";
/** Online výsledky: lhůta DNS, když ročník / test nemá žádný záznam Startu (Q113); chybí → 30 min. */
export const LIVE_DNS_GRACE_FALLBACK_KEY = "live_dns_grace_fallback";

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
  /** Lhůta DNS online výsledků (sekundy), když existuje aspoň jeden záznam Startu. */
  dnsGraceS: number;
  /** Lhůta DNS online výsledků (sekundy) bez jediného záznamu Startu. */
  dnsGraceFallbackS: number;
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
  const [edition, settings] = await Promise.all([
    current.editionId
      ? prisma.edition.findUnique({
          where: { id: current.editionId },
          select: { startInterval: true },
        })
      : null,
    prisma.setting.findMany({
      where: {
        key: {
          in: [
            LIVE_ZERO_OVERRIDE_KEY,
            LIVE_START_OFFSET_LIMIT_KEY,
            LIVE_DNS_GRACE_KEY,
            LIVE_DNS_GRACE_FALLBACK_KEY,
          ],
        },
      },
      select: { key: true, text: true },
    }),
  ]);
  const setting = (key: string) => settings.find((row) => row.key === key)?.text;
  const overrideZero = parseZeroOverride(setting(LIVE_ZERO_OVERRIDE_KEY));
  const officialZero = raceStartFor(current.raceDate, current.year);
  return {
    year: current.year,
    zero: overrideZero ?? officialZero,
    officialZero,
    intervalS: edition?.startInterval || DEFAULT_START_INTERVAL_S,
    zeroOverridden: overrideZero !== null,
    raceDate: current.raceDate,
    startLimitS: startOffsetLimitFromSetting(setting(LIVE_START_OFFSET_LIMIT_KEY)),
    dnsGraceS: durationFromSetting(setting(LIVE_DNS_GRACE_KEY), DEFAULT_DNS_GRACE_S),
    dnsGraceFallbackS: durationFromSetting(
      setting(LIVE_DNS_GRACE_FALLBACK_KEY),
      DEFAULT_DNS_GRACE_FALLBACK_S,
    ),
  };
}

export async function getStations(): Promise<Station[]> {
  const row = await prisma.setting.findUnique({
    where: { key: LIVE_STATIONS_KEY },
    select: { text: true },
  });
  return parseStations(row?.text);
}
