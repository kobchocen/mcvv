/**
 * Canonical race clock: first Sunday of December, Europe/Prague. The start time (zero) comes
 * from the edition (`st_nula_s`, editable in /admin/rocniky); 10:15 is only the default.
 */

export const RACE_TIME_ZONE = "Europe/Prague";
/** Default edition zero (seconds after midnight): 10:15:00. Source of truth is `st_nula_s`. */
export const DEFAULT_RACE_ZERO_SECONDS = 10 * 3600 + 15 * 60;
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

/** Seconds after midnight → [hour, minute, second]. */
export function clockParts(zeroSeconds: number): [number, number, number] {
  return [Math.floor(zeroSeconds / 3600), Math.floor((zeroSeconds % 3600) / 60), zeroSeconds % 60];
}

/** Start clock for texts: 36 900 → "10:15", 34 230 → "9:30:30" (seconds only when non-zero). */
export function formatStartClock(zeroSeconds: number): string {
  const [hour, minute, second] = clockParts(zeroSeconds);
  const base = `${hour}:${String(minute).padStart(2, "0")}`;
  return second ? `${base}:${String(second).padStart(2, "0")}` : base;
}

export function getEditionStart(year: number, zeroSeconds = DEFAULT_RACE_ZERO_SECONDS): Date {
  const day = firstSundayOfDecember(year);
  return zonedCivilToUtc(year, 12, day, ...clockParts(zeroSeconds));
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

export function resolveRaceCountdown(
  now: Date = new Date(),
  zeroSeconds = DEFAULT_RACE_ZERO_SECONDS,
): RaceCountdownResolution {
  const year = pragueCalendarYear(now);
  const start = getEditionStart(year, zeroSeconds);
  const inProgressEnd = getEditionInProgressEnd(year);

  if (now.getTime() < start.getTime()) {
    return { phase: "upcoming", target: start };
  }
  if (now.getTime() < inProgressEnd.getTime()) {
    return { phase: "in-progress", target: null };
  }
  return { phase: "upcoming", target: getEditionStart(year + 1, zeroSeconds) };
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
