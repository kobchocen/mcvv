const TIME_ZONE = "Europe/Prague";

function tag(locale: string): string {
  return locale === "en" ? "en-GB" : "cs-CZ";
}

function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

/** Numeric date: cs "2. 12. 2026", en "2 Dec 2026". */
export function formatDate(value: Date, locale: string): string {
  if (locale === "en") {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: TIME_ZONE,
    }).format(value);
  }
  return new Intl.DateTimeFormat(tag(locale), {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(value);
}

/** Race day with weekday: cs "Neděle 6. 12. 2026", en "Sunday 6 December 2026". */
export function formatRaceDate(value: Date, locale: string): string {
  const options: Intl.DateTimeFormatOptions =
    locale === "en"
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      : { weekday: "long", day: "numeric", month: "numeric", year: "numeric" };
  const text = new Intl.DateTimeFormat(tag(locale), { ...options, timeZone: TIME_ZONE })
    .format(value)
    .replace(/,/g, "");
  return capitalize(text);
}

/** Race day without year: cs "Neděle 6. prosince", en "Sunday, 6 December". */
export function formatRaceDay(value: Date, locale: string): string {
  const text = new Intl.DateTimeFormat(tag(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  }).format(value);
  return capitalize(locale === "en" ? text : text.replace(/,/g, ""));
}

/** Date and time: cs "2. 12. 2026 14:05", en "2 Dec 2026, 14:05". */
export function formatDateTime(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(tag(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(value);
}

/**
 * Short date and time for read receipts: cs "22. 10. 14:05", en "22 Oct, 14:05".
 * The year is added only when it differs from `now` (Prague calendar).
 */
export function formatShortDateTime(value: Date, locale: string, now = new Date()): string {
  const year = (date: Date) =>
    new Intl.DateTimeFormat("en", { year: "numeric", timeZone: TIME_ZONE }).format(date);
  const sameYear = year(value) === year(now);
  return new Intl.DateTimeFormat(tag(locale), {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(value);
}
