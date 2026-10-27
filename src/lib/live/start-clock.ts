import { parsePragueLocal } from "./admin-core";

/** Ruční zápis startu adminem (#203): denní čas v Europe/Prague (bez DB). */

/**
 * Denní čas startu `hh:mm[:ss]` (Europe/Prague) v den nuly → okamžik. Nesmysl → null.
 * `day` = datum nuly ve tvaru `YYYY-MM-DD` (Europe/Prague).
 */
export function parseStartClock(raw: string | null | undefined, day: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((raw ?? "").trim());
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return parsePragueLocal(
    `${day}T${match[1].padStart(2, "0")}:${match[2]}${match[3] ? `:${match[3]}` : ""}`,
  );
}

/** Okamžik → `hh:mm:ss` v Europe/Prague. */
export function pragueClock(date: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
