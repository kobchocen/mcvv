/**
 * Doplatek standardních přihlášek (čisté funkce): po konci standardu dostanou nezaplacené
 * přihlášky v den lhůty ráno e-mail „zaplaťte dnes do …“ a po lhůtě se automaticky zruší.
 * Zrušená přihláška se nikdy neobnovuje – pozdní platba jde na seznam k vrácení.
 */
import { ENTRY_STATUS } from "@/lib/entries/status-codes";

import { pragueCivil, type SlotType } from "./core";

/** Po lhůtě se ruší, až proběhne úspěšné stažení plateb zahájené po lhůtě; nejpozději po 60 min. */
export const CANCEL_GRACE_MS = 60 * 60 * 1000;

export type StandardPayPhase = "before" | "mail" | "cancel";

export function standardPayPhase(
  now: Date,
  input: { mailAt: Date; payUntil: Date },
): StandardPayPhase {
  if (now.getTime() >= input.payUntil.getTime()) return "cancel";
  if (now.getTime() >= input.mailAt.getTime()) return "mail";
  return "before";
}

export type StandardPayCandidate = {
  status: number | null;
  email: string | null;
  fee: number;
  paid: number;
  slot: SlotType | null;
};

/** Nezaplacená (stav 2) placená standardní přihláška se zbývající částkou. */
export function needsStandardPayment(c: StandardPayCandidate): boolean {
  return (
    c.status === ENTRY_STATUS.unpaid && c.fee > 0 && c.fee - c.paid > 0 && isStandardSlot(c.slot)
  );
}

/** Přihláška ze standardu (bez záznamu termínu = standard, přihlášky před zavedením termínů). */
export function isStandardSlot(slot: SlotType | null): boolean {
  return slot === null || slot === "standard" || slot === "early";
}

export function hasMailAddress(email: string | null): email is string {
  return Boolean(email?.includes("@"));
}

/**
 * Lze už rušit? Až po úspěšném stažení plateb, které začalo po lhůtě (platba z poslední chvíle
 * se stihne přiřadit). Když stažení nejde, ruší se po `CANCEL_GRACE_MS` i tak (`forced`).
 */
export function cancelReadiness(
  now: Date,
  payUntil: Date,
  lastOkPaymentsRunStartedAt: Date | null,
): { ready: boolean; forced: boolean } {
  if (now.getTime() < payUntil.getTime()) return { ready: false, forced: false };
  if (lastOkPaymentsRunStartedAt && lastOkPaymentsRunStartedAt.getTime() >= payUntil.getTime()) {
    return { ready: true, forced: false };
  }
  const forced = now.getTime() >= payUntil.getTime() + CANCEL_GRACE_MS;
  return { ready: forced, forced };
}

const WEEKDAY_IN = [
  "v neděli",
  "v pondělí",
  "v úterý",
  "ve středu",
  "ve čtvrtek",
  "v pátek",
  "v sobotu",
] as const;

const WEEKDAY_UNTIL = [
  "neděle",
  "pondělí",
  "úterý",
  "středy",
  "čtvrtka",
  "pátku",
  "soboty",
] as const;

function civilWeekday(c: { year: number; month: number; day: number }): number {
  return new Date(Date.UTC(c.year, c.month - 1, c.day)).getUTCDay();
}

/** „ve čtvrtek 3. 12.“ (s rokem „ve čtvrtek 3. 12. 2026“) v pražském čase. */
export function pragueDayLabel(d: Date, withYear = false): string {
  const c = pragueCivil(d);
  return `${WEEKDAY_IN[civilWeekday(c)]} ${c.day}. ${c.month}.${withYear ? ` ${c.year}` : ""}`;
}

/** „do soboty 5. 12.“ v pražském čase. */
export function pragueUntilDayLabel(d: Date): string {
  const c = pragueCivil(d);
  return `do ${WEEKDAY_UNTIL[civilWeekday(c)]} ${c.day}. ${c.month}.`;
}

/** „12:00“ v pražském čase. */
export function pragueClock(d: Date): string {
  const c = pragueCivil(d);
  return `${c.hour}:${String(c.minute).padStart(2, "0")}`;
}

/** „ve 23:59“ / „v 9:45“ – předložka podle vyslovené hodiny (ve dvě, ve třináct, v devět). */
export function pragueAtClock(d: Date): string {
  const { hour } = pragueCivil(d);
  const ve = [2, 3, 4, 12, 13, 14, 20, 21, 22, 23].includes(hour);
  return `${ve ? "ve" : "v"} ${pragueClock(d)}`;
}

/** Poslední minuta exkluzivního konce („skončily ve středu 2. 12. ve 23:59“). */
export function lastMinuteOf(end: Date): Date {
  return new Date(end.getTime() - 60 * 1000);
}

export function standardPayMailDedupeKey(year: number, id: number): string {
  return `standardpay:${year}:${id}`;
}

export function autoCancelMailDedupeKey(year: number, id: number): string {
  return `autocancel:${year}:${id}`;
}
