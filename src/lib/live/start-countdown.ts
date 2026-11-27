/**
 * Sdílený odpočet do plánovaného startu pro obrazovky Startér a Předstartér (#379).
 *
 * Dlouhý zápis `−211:39:54` rozhází řádek dlaždice a na mobilu 390×844 ořezává jména.
 * Do hodiny zůstávají minuty a sekundy (`−4:59`, po startu `+0:03`) – sekundový odpočet
 * na startu je kritický. Do 24 h hodiny a minuty, dál jen datum startu.
 */
import { formatCountdown } from "./starter-core";

export type StartCountdown =
  | { kind: "clock"; text: string }
  | { kind: "hours"; hours: number; minutes: number; past: boolean }
  | { kind: "date"; at: number };

const DAY_MS = 24 * 3_600_000;

/** Stejný formát jako `prestartCountdown` (alias v prestarter-core). */
export function startCountdown(remainingMs: number, plannedMs: number): StartCountdown {
  const past = remainingMs <= 0;
  const seconds = Math.round(Math.abs(remainingMs) / 1000);
  if (seconds < 3600) {
    return { kind: "clock", text: `${past ? "+" : "−"}${formatCountdown(seconds)}` };
  }
  if (seconds < DAY_MS / 1000) {
    const totalMinutes = Math.floor(seconds / 60);
    return {
      kind: "hours",
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
      past,
    };
  }
  return { kind: "date", at: plannedMs };
}

/** Odpočet nad hodinu (kratší písmo, ať nerozhází řádek). */
export function isLongCountdown(remainingMs: number): boolean {
  return startCountdown(remainingMs, 0).kind !== "clock";
}

export type StartCountdownMessages = {
  hours: (hours: number, minutes: number) => string;
  hoursAgo: (hours: number, minutes: number) => string;
  hoursShort: (hours: number) => string;
  hoursShortAgo: (hours: number) => string;
};

/**
 * Text odpočtu pro dlaždici (plný) i startovku (`short`: bez minut, datum beze změny).
 */
export function formatStartCountdown(
  remainingMs: number,
  plannedMs: number,
  locale: string,
  messages: StartCountdownMessages,
  short = false,
): string {
  const countdown = startCountdown(remainingMs, plannedMs);
  if (countdown.kind === "clock") return countdown.text;
  if (countdown.kind === "hours" && short) {
    return countdown.past
      ? messages.hoursShortAgo(countdown.hours)
      : messages.hoursShort(countdown.hours);
  }
  if (countdown.kind === "hours") {
    return countdown.past
      ? messages.hoursAgo(countdown.hours, countdown.minutes)
      : messages.hours(countdown.hours, countdown.minutes);
  }
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: locale === "cs" ? "numeric" : "short",
  }).format(countdown.at);
}
