/**
 * Adaptivní interval cron rout (část 6): ACA Job volá routy každou minutu, ale běžně se
 * pracuje jen jednou za 15 min (dosavadní interval). Každou minutu jen ve „spěchu“ –
 * když nějaká odeslaná pozdní přihláška čeká na platbu (lhůta 60 min).
 */

/** Dosavadní interval cron rout. */
export const CRON_SLOW_INTERVAL_MS = 15 * 60_000;
/**
 * Rezerva na rozptyl startu ACA Jobu (spouští se po minutách, start kolísá o sekundy):
 * běh v :15:02 po běhu v :00:05 se musí počítat jako „po 15 min“.
 */
export const CRON_SLACK_MS = 45_000;
/**
 * Jak dlouho po lhůtě na zaplacení se ještě kontroluje každou minutu: pokrývá pojistku
 * zrušení (+5 min) a pomalé zpracování, pak se interval vrátí na 15 min.
 */
export const LATE_FAST_AFTER_MS = 10 * 60_000;

/** Má běžet „pomalá“ (15min) část cron routy? */
export function slowDue(now: Date, lastRun: Date | null): boolean {
  if (!lastRun) return true;
  // Posun hodin zpět (nebo budoucí zápis) nesmí běh zablokovat navždy.
  if (lastRun.getTime() > now.getTime()) return true;
  return now.getTime() - lastRun.getTime() >= CRON_SLOW_INTERVAL_MS - CRON_SLACK_MS;
}

/** Hranice `platba_do`, od které se odeslaná pozdní přihláška počítá jako „čekající“. */
export function lateFastSince(now: Date): Date {
  return new Date(now.getTime() - LATE_FAST_AFTER_MS);
}

export type CronDecision = { run: boolean; fast: boolean; slow: boolean };

/** Rozhodnutí pro routu: běží ve spěchu (každou minutu) nebo po 15 min. */
export function cronDecision(fastAllowed: boolean, pending: boolean, slow: boolean): CronDecision {
  const fast = fastAllowed && pending;
  return { run: slow || fast, fast, slow };
}

export type NextCheck = { at: Date; fast: boolean };

/**
 * Odhad další kontroly banky pro /admin/platby (část 8): ve spěchu (pozdní přihláška čeká
 * na platbu) nejbližší celá minuta, jinak první minutový běh, kdy je pomalý běh splatný
 * (`slowDue`). Bez záznamu nebo po splatnosti = nejbližší minuta.
 */
export function nextBankCheck(now: Date, lastSlow: Date | null, pending: boolean): NextCheck {
  const ceilMinute = (ms: number) => new Date(Math.ceil(ms / 60_000) * 60_000);
  const soon = ceilMinute(now.getTime() + 1);
  if (pending) return { at: soon, fast: true };
  if (!lastSlow || lastSlow.getTime() > now.getTime()) return { at: soon, fast: false };
  const due = ceilMinute(lastSlow.getTime() + CRON_SLOW_INTERVAL_MS - CRON_SLACK_MS);
  return { at: due.getTime() > soon.getTime() ? due : soon, fast: false };
}
