import { FIO_MIN_INTERVAL_MS } from "./fio";

/** „Ověřit platbu“ (část 6): jedna přihláška smí banku dotázat nejvýš 1× za 30 s. */
export const VERIFY_MIN_INTERVAL_MS = 30_000;

/** Klíč v mcvv_job_state s časem posledního ověření dané přihlášky. */
export function verifyStateName(year: number, id: number): string {
  return `verify_pay_${year}_${id}`;
}

/**
 * Kolik sekund je ještě třeba počkat (0 = lze se ptát banky). Hlídá limit tlačítka
 * (30 s na přihlášku) i limit Fio API (1 dotaz / 30 s na token, sdílený s cronem).
 */
export function verifyWaitSeconds(
  now: Date,
  lastVerify: Date | null,
  lastFioRequest: Date | null,
): number {
  const t = now.getTime();
  const waits = [0];
  if (lastVerify && lastVerify.getTime() <= t)
    waits.push(lastVerify.getTime() + VERIFY_MIN_INTERVAL_MS - t);
  if (lastFioRequest && lastFioRequest.getTime() <= t)
    waits.push(lastFioRequest.getTime() + FIO_MIN_INTERVAL_MS - t);
  return Math.max(0, Math.ceil(Math.max(...waits) / 1000));
}

/** Datum z hodnoty v mcvv_job_state (neplatné → null). */
export function stateDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
