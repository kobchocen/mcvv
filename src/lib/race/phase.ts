import {
  getEditionStart,
  RACE_START_HOUR,
  RACE_START_MINUTE,
  zonedCivilToUtc,
} from "@/lib/date/race-schedule";

/**
 * Homepage hero phases of a race year (pure, no DB / framework imports).
 *
 * - A – entries: before the start list is published ("Přihlášky (n)" + "Rozpis", countdown).
 * - B – start list published (admin setting) and race not started yet
 *       ("Startovka (n)" + "Pokyny").
 * - C – race started (Edition.date at 10:15 Europe/Prague) and no results yet
 *       ("Online výsledky" external link, or "Výsledky" when the URL is not set, + "Pokyny").
 *       C lasts until the first result of the year is stored.
 * - D – results of the year exist ("Výsledky (n)").
 */
export type HeroPhase = "A" | "B" | "C" | "D";

export type HeroPhaseInput = {
  now: Date;
  raceStart: Date;
  startlistPublished: boolean;
  resultsCount: number;
};

export function resolveHeroPhase({
  now,
  raceStart,
  startlistPublished,
  resultsCount,
}: HeroPhaseInput): HeroPhase {
  if (resultsCount > 0) {
    return "D";
  }
  if (now.getTime() >= raceStart.getTime()) {
    return "C";
  }
  if (startlistPublished) {
    return "B";
  }
  return "A";
}

/**
 * Race start instant: the edition date (a calendar date, stored as UTC midnight) at
 * 10:15 Europe/Prague; without an edition date the canonical first Sunday of December.
 */
export function raceStartFor(editionDate: Date | null | undefined, year: number): Date {
  if (!editionDate) {
    return getEditionStart(year);
  }
  return zonedCivilToUtc(
    editionDate.getUTCFullYear(),
    editionDate.getUTCMonth() + 1,
    editionDate.getUTCDate(),
    RACE_START_HOUR,
    RACE_START_MINUTE,
  );
}

export type HeroButtonKind = "entries" | "program" | "startlist" | "instructions" | "results";

export type HeroButton =
  | {
      kind: HeroButtonKind;
      href: "/prihlaseni-zavodnici" | "/program" | "/startovka" | "/pokyny" | "/vysledky";
      count?: number;
      external?: false;
    }
  /** Vlastní veřejné online výsledky (Q116). */
  | { kind: "onlineResults"; href: "/vysledky/online"; external?: false; count?: undefined }
  /** Nouzová ručně zadaná URL (Q116). */
  | { kind: "onlineResults"; href: string; external: true; count?: undefined };

export type HeroButtons = {
  primary: HeroButton;
  secondary: HeroButton | null;
  showCountdown: boolean;
};

export type HeroButtonsInput = {
  phase: HeroPhase;
  entriesCount: number;
  startlistCount: number;
  resultsCount: number;
  /** Nouzová ručně zadaná URL online výsledků; null = vlastní `/vysledky/online`. */
  onlineResultsUrl: string | null;
};

/** Buttons shown in the hero for a phase (labels are resolved by the component). */
export function heroButtons({
  phase,
  entriesCount,
  startlistCount,
  resultsCount,
  onlineResultsUrl,
}: HeroButtonsInput): HeroButtons {
  const instructions: HeroButton = { kind: "instructions", href: "/pokyny" };
  switch (phase) {
    case "D":
      return {
        primary: { kind: "results", href: "/vysledky", count: resultsCount },
        secondary: null,
        showCountdown: false,
      };
    case "C":
      return {
        primary: onlineResultsUrl
          ? { kind: "onlineResults", href: onlineResultsUrl, external: true }
          : { kind: "onlineResults", href: "/vysledky/online" },
        secondary: instructions,
        showCountdown: false,
      };
    case "B":
      return {
        primary: { kind: "startlist", href: "/startovka", count: startlistCount },
        secondary: instructions,
        showCountdown: false,
      };
    case "A":
      return {
        primary: { kind: "entries", href: "/prihlaseni-zavodnici", count: entriesCount },
        secondary: { kind: "program", href: "/program" },
        showCountdown: true,
      };
  }
}
