/** Canonical race clock: first Sunday of December, 10:15 Europe/Prague. */

export const RACE_TIME_ZONE = "Europe/Prague";
export const RACE_START_HOUR = 10;
export const RACE_START_MINUTE = 15;
/** Exclusive end of the "race in progress" window (13:00 Prague). */
export const RACE_IN_PROGRESS_END_HOUR = 13;

export type RaceCountdownPhase = "upcoming" | "in-progress";

export type RemainingParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export type RaceCountdownResolution = {
  phase: RaceCountdownPhase;
  target: Date | null;
};

function tzOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = get("hour");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour === 24 ? 0 : hour,
    get("minute"),
    get("second"),
  );
  return asUtc - date.getTime();
}

/** Instant whose civil time in `timeZone` equals the given wall clock. */
export function zonedCivilToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
  timeZone = RACE_TIME_ZONE,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const adjusted = utcGuess - tzOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - tzOffsetMs(new Date(adjusted), timeZone));
}

export function firstSundayOfDecember(year: number): number {
  for (let day = 1; day <= 7; day += 1) {
    const noon = zonedCivilToUtc(year, 12, day, 12, 0);
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: RACE_TIME_ZONE,
      weekday: "short",
    }).format(noon);
    if (weekday === "Sun") {
      return day;
    }
  }
  throw new Error(`No Sunday found in the first week of December ${year}`);
}

export function getEditionStart(year: number): Date {
  const day = firstSundayOfDecember(year);
  return zonedCivilToUtc(year, 12, day, RACE_START_HOUR, RACE_START_MINUTE);
}

export function getEditionInProgressEnd(year: number): Date {
  const day = firstSundayOfDecember(year);
  return zonedCivilToUtc(year, 12, day, RACE_IN_PROGRESS_END_HOUR, 0);
}

export function pragueCalendarYear(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: RACE_TIME_ZONE,
      year: "numeric",
    }).format(now),
  );
}

export function resolveRaceCountdown(now: Date = new Date()): RaceCountdownResolution {
  const year = pragueCalendarYear(now);
  const start = getEditionStart(year);
  const inProgressEnd = getEditionInProgressEnd(year);

  if (now.getTime() < start.getTime()) {
    return { phase: "upcoming", target: start };
  }
  if (now.getTime() < inProgressEnd.getTime()) {
    return { phase: "in-progress", target: null };
  }
  return { phase: "upcoming", target: getEditionStart(year + 1) };
}

export function remainingParts(target: Date, now: Date): RemainingParts {
  const totalSeconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}
