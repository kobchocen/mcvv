export const R1_DELAY_MS = 24 * 60 * 60 * 1000;

export type ReminderCandidate = {
  status: number | null;
  email: string | null;
  fee: number;
  paid: number;
  lastModified: Date | null;
  reminder1At: Date | null;
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

/** Odesílací okno R1 8–20 h (Praha). */
export function isReminder1Window(now: Date): boolean {
  const { hour } = pragueNow(now);
  return hour >= 8 && hour < 20;
}

/**
 * Patří přihlášce připomínka R1? Jen nezaplacené (stav 2) se zbývající částkou a e-mailem,
 * ≥ 24 h od poslední změny, do konce standardních přihlášek (`standardEnd`, exkluzivní). Max. jednou.
 * Ranní e-mail po uzávěrce („zaplaťte dnes do 12:00“) a zrušení řeší doplatek standardu
 * (`@/lib/slots/standard-pay-job`), dřívější R2 ho nahradil.
 */
export function dueReminder(
  c: ReminderCandidate,
  input: { now: Date; standardEnd: Date | null },
): 1 | null {
  if (c.status !== 2 || !c.email?.includes("@") || c.fee - c.paid <= 0) return null;
  const beforeDeadline = !input.standardEnd || input.now.getTime() < input.standardEnd.getTime();
  if (
    !c.reminder1At &&
    beforeDeadline &&
    isReminder1Window(input.now) &&
    c.lastModified &&
    input.now.getTime() - c.lastModified.getTime() >= R1_DELAY_MS
  ) {
    return 1;
  }
  return null;
}
