/**
 * Pozdní přihlášky (late) – čistá pravidla bez DB (NAVRH 2.3).
 * - Přihláška vzniká s prvním běžcem jako rozpracovaná (košík); odesláním (checkbox
 *   „Zaplatím ihned“) se uzavře a začne běžet lhůta na zaplacení (`platba_do` = +60 min).
 * - Odeslanou přihlášku už nelze z webu měnit (Q330); zaplacená je zamčená (Q332).
 * - Na e-mail nejvýš jedna nezaplacená odeslaná pozdní přihláška (Q344); dalšího běžce
 *   lze přidat až po jejím zaplacení / zrušení – do nové přihlášky (zaplacená se nedoplňuje, Q343).
 * - Po lhůtě a kontrole plateb se nezaplacená přihláška automaticky zruší; pozdější platba
 *   jde k vrácení, přihláška se neobnovuje.
 */
import { emailEquals, isCancelledStatus } from "@/lib/entries/ensure-core";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";

import type { SlotType } from "./core";

/** Lhůta na zaplacení odeslané pozdní přihlášky. */
export const LATE_PAY_MINUTES = 60;
/**
 * Rozpracovaná (neodeslaná) pozdní přihláška se bez změny po této době automaticky zruší
 * a uvolní své běžce (Q351).
 */
export const LATE_DRAFT_TTL_MINUTES = 60;
/** Když se platby po lhůtě nepodaří stáhnout, zruší se přihláška i tak po této pojistce. */
export const LATE_CANCEL_GRACE_MS = 5 * 60 * 1000;

export type LateEntryState = "draft" | "awaiting" | "paid" | "cancelled";

export type LateEntryRow = {
  id: number;
  email: string | null;
  status: number | null;
  slot: SlotType | null;
  submittedAt: Date | null;
};

/** Zaplaceno v plné výši (stav zaplaceno / přeplaceno / potvrzeno). */
export function isPaidStatus(status: number | null | undefined): boolean {
  return (
    status === ENTRY_STATUS.paid ||
    status === ENTRY_STATUS.overpaid ||
    status === ENTRY_STATUS.confirmed
  );
}

/** Stav pozdní přihlášky pro web. */
export function lateEntryState(row: {
  status: number | null;
  submittedAt: Date | null;
}): LateEntryState {
  if (isCancelledStatus(row.status)) return "cancelled";
  if (!row.submittedAt) return "draft";
  return isPaidStatus(row.status) ? "paid" : "awaiting";
}

/** Lhůta na zaplacení od odeslání. */
export function latePayUntil(submittedAt: Date, minutes = LATE_PAY_MINUTES): Date {
  return new Date(submittedAt.getTime() + minutes * 60 * 1000);
}

/**
 * Kam přidat dalšího běžce v pozdních přihláškách: do rozpracované (neodeslané) pozdní přihlášky
 * e-mailu (při více ta s nejnižším číslem); zaplacené a zrušené se přeskakují (Q343).
 * `blocking` = odeslaná, ještě nezaplacená pozdní přihláška – pak se nová nezakládá (Q344).
 */
export function pickLateTarget<T extends LateEntryRow>(
  rows: readonly T[],
  email: string,
): { target: T | null; blocking: T | null } {
  const mine = rows
    .filter((row) => emailEquals(row.email, email) && row.slot === "late")
    .sort((a, b) => a.id - b.id);
  const blocking = mine.find((row) => lateEntryState(row) === "awaiting") ?? null;
  const target = mine.find((row) => lateEntryState(row) === "draft") ?? null;
  return { target, blocking };
}

/**
 * Lze odeslanou pozdní přihlášku po lhůtě zrušit? Až po úspěšném stažení plateb, které začalo
 * po lhůtě (platba z poslední chvíle se stihne přiřadit); když stažení nejde, po pojistce i tak.
 */
export function lateCancelReadiness(
  now: Date,
  payUntil: Date,
  lastOkPaymentsRunStartedAt: Date | null,
): { ready: boolean; forced: boolean } {
  if (now.getTime() < payUntil.getTime()) return { ready: false, forced: false };
  if (lastOkPaymentsRunStartedAt && lastOkPaymentsRunStartedAt.getTime() >= payUntil.getTime()) {
    return { ready: true, forced: false };
  }
  const forced = now.getTime() >= payUntil.getTime() + LATE_CANCEL_GRACE_MS;
  return { ready: forced, forced };
}

/** Má se odeslaná pozdní přihláška po lhůtě zrušit (nezaplacená v plné výši)? */
export function lateNeedsCancel(c: {
  status: number | null;
  slot: SlotType | null;
  submittedAt: Date | null;
  payUntil: Date | null;
  fee: number;
  paid: number;
}): boolean {
  if (c.slot !== "late" || !c.submittedAt || !c.payUntil) return false;
  if (isCancelledStatus(c.status) || isPaidStatus(c.status)) return false;
  return c.fee > 0 && c.paid < c.fee;
}

/** Zbývající čas do lhůty v sekundách (nejméně 0). */
export function secondsLeft(now: Date, payUntil: Date): number {
  return Math.max(0, Math.floor((payUntil.getTime() - now.getTime()) / 1000));
}

/**
 * Má se rozpracovaná pozdní přihláška zrušit? Po `ttlMinutes` od poslední změny (přidání
 * běžce, úprava), nebo když pozdní přihlášky skončily (nikdo ji už nemůže odeslat).
 */
export function lateDraftExpired(
  now: Date,
  lastChange: Date | null,
  lateEnd: Date,
  ttlMinutes = LATE_DRAFT_TTL_MINUTES,
): boolean {
  if (now.getTime() >= lateEnd.getTime()) return true;
  if (!lastChange) return false;
  return now.getTime() >= lastChange.getTime() + ttlMinutes * 60 * 1000;
}

/** Poslední změna přihlášky: meta `updated_at`, založení přihlášky a řádků (nejpozdější). */
export function lastChangeOf(times: readonly (Date | null | undefined)[]): Date | null {
  const ms = Math.max(0, ...times.map((d) => d?.getTime() ?? 0));
  return ms > 0 ? new Date(ms) : null;
}

export function latePayMailDedupeKey(year: number, id: number): string {
  return `latepay:${year}:${id}`;
}

export function lateCancelMailDedupeKey(year: number, id: number): string {
  return `latecancel:${year}:${id}`;
}
