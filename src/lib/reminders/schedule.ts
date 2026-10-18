export const R1_DELAY_MS = 24 * 60 * 60 * 1000;

export type ReminderCandidate = {
  status: number | null;
  email: string | null;
  fee: number;
  paid: number;
  lastModified: Date | null;
  reminder1At: Date | null;
  reminder2At: Date | null;
};

/** Pražský den (YYYY-MM-DD) a hodina. */
export function pragueNow(now: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

/** R2 jde jednou 3. 12. ráno (Praha): okno 7:00–11:59, aby výpadek jobu nevedl k odeslání večer. */
export function isReminder2Window(now: Date, year: number): boolean {
  const { day, hour } = pragueNow(now);
  return day === `${year}-12-03` && hour >= 7 && hour < 12;
}

/** Odesílací okno R1 8–20 h (Praha). */
export function isReminder1Window(now: Date): boolean {
  const { hour } = pragueNow(now);
  return hour >= 8 && hour < 20;
}

/**
 * Která připomínka (pokud vůbec) patří přihlášce. Jen nezaplacené (stav 2) se zbývající částkou a e-mailem.
 * R1: ≥ 24 h od poslední změny, do konce uzávěrky. R2: 3. 12. ráno. Každá max. jednou.
 */
export function dueReminder(
  c: ReminderCandidate,
  input: { now: Date; year: number; deadlineEnd: Date | null },
): 1 | 2 | null {
  if (c.status !== 2 || !c.email?.includes("@") || c.fee - c.paid <= 0) return null;
  if (!c.reminder2At && isReminder2Window(input.now, input.year)) return 2;
  const beforeDeadline = !input.deadlineEnd || input.now.getTime() <= input.deadlineEnd.getTime();
  if (
    !c.reminder1At &&
    !c.reminder2At &&
    beforeDeadline &&
    isReminder1Window(input.now) &&
    c.lastModified &&
    input.now.getTime() - c.lastModified.getTime() >= R1_DELAY_MS
  ) {
    return 1;
  }
  return null;
}
