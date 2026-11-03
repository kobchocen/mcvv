/**
 * Admin přehledy termínů přihlášek (část 8, NAVRH 2.8) – čistá pravidla bez DB:
 * filtr / sloupec Termín v /admin/prihlasky a stav pozdní přihlášky.
 */
import { isCancelledStatus } from "@/lib/entries/ensure-core";

import { SLOT_TYPES, type SlotType } from "./core";
import { isPaidStatus } from "./late-core";

/** Termín přihlášky; přihláška bez záznamu (před zavedením termínů) je standardní. */
export function entrySlot(slot: SlotType | null | undefined): SlotType {
  return slot ?? "standard";
}

/** Hodnota filtru `?termin=` (neplatná / prázdná = všechny termíny). */
export function parseSlotFilter(raw: string | null | undefined): SlotType | null {
  return SLOT_TYPES.find((type) => type === raw) ?? null;
}

export type LateAdminState =
  | { kind: "draft" }
  | { kind: "awaiting"; secondsLeft: number }
  | { kind: "overdue"; secondsOver: number }
  | { kind: "paid" }
  | { kind: "autoCancelled" }
  | { kind: "cancelled" };

/**
 * Stav pozdní přihlášky v admin seznamu: rozpracovaná (neodeslaná), čeká na platbu (zbývá),
 * po lhůtě (čeká na kontrolu banky a zrušení), zaplacená, automaticky zrušená, zrušená.
 */
export function lateAdminState(
  row: {
    status: number | null;
    submittedAt: Date | null;
    payUntil: Date | null;
    autoCancelledAt: Date | null;
  },
  now: Date,
): LateAdminState {
  if (isCancelledStatus(row.status)) {
    return row.autoCancelledAt ? { kind: "autoCancelled" } : { kind: "cancelled" };
  }
  if (isPaidStatus(row.status)) return { kind: "paid" };
  if (!row.submittedAt) return { kind: "draft" };
  if (!row.payUntil) return { kind: "awaiting", secondsLeft: 0 };
  const diff = Math.floor((row.payUntil.getTime() - now.getTime()) / 1000);
  return diff > 0
    ? { kind: "awaiting", secondsLeft: diff }
    : { kind: "overdue", secondsOver: Math.abs(diff) };
}

/** Sekundy jako m:ss (např. 42:07, 125:00). */
export function minutesSeconds(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
