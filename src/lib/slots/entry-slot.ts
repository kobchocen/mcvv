/**
 * Přihláška a termín (čisté funkce, bez DB): jedna aktivní přihláška na e-mail **a termín**
 * (Q302/Q303). Přihláška patří termínu, ve kterém vznikla (`mcvv_prihlaska_meta.slot`; bez
 * záznamu = standard). Měnit ji z webu jde jen, dokud její termín běží; po jeho konci je
 * zamčená (jen čtení), opravy dělá jen administrace (Q329). Další běžec po konci termínu
 * = nová přihláška v běžícím termínu s vlastním VS.
 */
import { emailEquals, isCancelledStatus } from "@/lib/entries/ensure-core";

import { activeSlot, type Slot, type SlotType } from "./core";

/** Termín přihlášky; bez záznamu (přihlášky před zavedením termínů) = standard. */
export function entrySlotType(slot: SlotType | null | undefined): SlotType {
  return slot ?? "standard";
}

/** Startovné zdarma (vítězové, veteráni, …) jen v early a standardu (Q301). */
export function freeEntryAllowed(slot: SlotType | null | undefined): boolean {
  const type = entrySlotType(slot);
  return type === "early" || type === "standard";
}

export type EntryRow = {
  id: number;
  email: string | null;
  status: number | null;
  slot: SlotType | null;
};

/**
 * Přihláška e-mailu v daném termínu, do které se dá přidávat (nezrušená); při více kandidátech
 * ta s nejnižším číslem. Ročník bez termínů (`slot` = null) → dosavadní chování: kterákoli
 * nezrušená přihláška.
 */
export function pickWritableRegistration<T extends EntryRow>(
  rows: readonly T[],
  email: string,
  slot: SlotType | null,
): T | null {
  const mine = rows
    .filter(
      (row) =>
        emailEquals(row.email, email) &&
        !isCancelledStatus(row.status) &&
        (slot === null || entrySlotType(row.slot) === slot),
    )
    .sort((a, b) => a.id - b.id);
  return mine[0] ?? null;
}

export type EntryWriteContext = {
  /** Aktuální ročník. */
  year: number;
  /** Přihlášky otevřené (se sloty: běží early/standard; bez slotů: do konce uzávěrky). */
  open: boolean;
  slots: readonly Slot[];
  now: Date;
};

/** Termín, do kterého teď vznikají nové přihlášky z webu; ročník bez termínů / zavřeno → null. */
export function currentEntrySlot(ctx: EntryWriteContext): SlotType | null {
  if (ctx.slots.length === 0 || !ctx.open) return null;
  return activeSlot(ctx.slots, ctx.now)?.type ?? null;
}

/**
 * Smí přihlašující přihlášku měnit z webu? Jen přihlášku aktuálního ročníku, nezrušenou,
 * při otevřených přihláškách a – se sloty – jen když běží termín, ve kterém vznikla.
 */
export function registrationWritable(
  ctx: EntryWriteContext,
  reg: { year: number; status: number | null; slot: SlotType | null },
): boolean {
  if (reg.year !== ctx.year || !ctx.open || isCancelledStatus(reg.status)) return false;
  if (ctx.slots.length === 0) return true;
  const running = currentEntrySlot(ctx);
  return running !== null && entrySlotType(reg.slot) === running;
}

/**
 * Pořadí přihlášek na „Moje přihláška“: nahoře měnitelná (v běžícím termínu; při více té
 * s nejnižším číslem, stejně jako `pickWritableRegistration`), pak zamčené od nejnovější.
 */
export function orderMyEntries<T extends { id: number; writable: boolean }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.writable !== b.writable) return a.writable ? -1 : 1;
    return a.writable ? a.id - b.id : b.id - a.id;
  });
}
