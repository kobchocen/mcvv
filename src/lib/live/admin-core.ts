import { zonedCivilToUtc } from "@/lib/date/race-schedule";
import { isoWithOffset } from "@/lib/ofeed/iof-xml";

/** `<input type="datetime-local">` (Europe/Prague) → instant; nesmysl → null. */
export function parsePragueLocal(raw: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec((raw ?? "").trim());
  if (!match) return null;
  const [y, mo, d, h, mi] = match.slice(1, 6).map(Number);
  const sec = match[6] ? Number(match[6]) : 0;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return null;
  return zonedCivilToUtc(y, mo, d, h, mi, sec);
}

/** Instant → hodnota pro `<input type="datetime-local">` v Europe/Prague. */
export function toPragueLocalInput(date: Date | null): string {
  return date ? isoWithOffset(date).slice(0, 16) : "";
}

/** Výchozí platnost klíče zařízení: den závodu 6:00–18:00. */
export function defaultTokenWindow(zero: Date): { from: Date; until: Date } {
  const day = isoWithOffset(zero).slice(0, 10);
  return {
    from: parsePragueLocal(`${day}T06:00`)!,
    until: parsePragueLocal(`${day}T18:00`)!,
  };
}

export const OUTCOME_LABELS_CS: Record<string, string> = {
  applied: "zapsáno",
  duplicate: "duplicita",
  unchanged: "beze změny",
  conflict: "konflikt",
  resolved: "konflikt přijat",
  rejected: "odmítnuto",
  replaced: "opraveno",
  deleted: "smazáno",
};
