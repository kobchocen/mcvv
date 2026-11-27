/**
 * Kancelář – otevřený košík (#378). Čisté funkce bez DB (testovatelné, bezpečné i pro klientský
 * bundle).
 *
 * Košík = nezaplacená prodejka s `checkoutAt` null. Obsluha do ní přidává dohlášky (řádky
 * s `entry`, jedna přihláška typu O s více běžci) i položky ceníku (řádky s `itemId`). Teprve
 * akce „K platbě“ prodejku uzavře (nastaví `checkoutAt`), pak se ukáže součet, QR a platba.
 */

import { SALE_LINES_MAX, SALE_QTY_MAX, type SaleLineDraft } from "./core";

export type CartState = { status: string; checkoutAt: Date | string | null };

/** Rozpracovaná prodejka: nezaplacená a ještě neuzavřená k platbě. */
export function isSaleOpen(sale: CartState): boolean {
  return sale.status === "unpaid" && sale.checkoutAt == null;
}

/** Nezaplacená prodejka uzavřená k platbě (QR a tlačítka platby). */
export function isSaleAwaitingPayment(sale: CartState): boolean {
  return sale.status === "unpaid" && sale.checkoutAt != null;
}

export type CartLine = { entry: boolean; lineTotal: number };

export function saleLinesTotal(lines: ReadonlyArray<{ lineTotal: number }>): number {
  return lines.reduce((sum, line) => sum + line.lineTotal, 0);
}

/** Součet startovného (řádky dohlášek) a merche (ostatní řádky) prodejky. */
export function cartTotals(lines: ReadonlyArray<CartLine>): {
  entries: number;
  merch: number;
  total: number;
  runners: number;
} {
  let entries = 0;
  let merch = 0;
  let runners = 0;
  for (const line of lines) {
    if (line.entry) {
      entries += line.lineTotal;
      runners += 1;
    } else merch += line.lineTotal;
  }
  return { entries, merch, total: entries + merch, runners };
}

/**
 * Částka platby přihlášky po zaplacení prodejky: jen startovné (řádky dohlášek), ne merch.
 * Pojistka: prodejka s přihláškou bez označeného řádku startovného (data před #378) – celá částka je
 * startovné → `sale.total`. Prodejka bez přihlášky → null (žádná platba přihlášky).
 */
export function onsiteEntryAmount(
  sale: { registrationId: number | null; total: number },
  lines: ReadonlyArray<CartLine>,
): number | null {
  if (sale.registrationId == null) return null;
  if (!lines.some((line) => line.entry)) return sale.total;
  return cartTotals(lines).entries;
}

export type ExistingMerchLine = {
  id: number;
  itemId: number | null;
  entry: boolean;
  unitPrice: number;
  quantity: number;
};

export type MerchMergePlan =
  | {
      ok: true;
      update: { id: number; quantity: number; lineTotal: number }[];
      create: SaleLineDraft[];
    }
  | { ok: false; error: "quantity" | "too_many" };

/**
 * Přidání položek ceníku do košíku: stejná položka za stejnou cenu se přičte k existujícímu
 * řádku, jinak vznikne nový (změna ceny v ceníku se nedotkne už přidaných kusů). Hlídá max.
 * kusů na řádek a max. řádků prodejky.
 */
export function planMerchMerge(
  existing: ReadonlyArray<ExistingMerchLine>,
  added: ReadonlyArray<SaleLineDraft>,
): MerchMergePlan {
  const update = new Map<number, { id: number; quantity: number; lineTotal: number }>();
  const create: SaleLineDraft[] = [];
  for (const line of added) {
    const match = existing.find(
      (row) => !row.entry && row.itemId === line.itemId && row.unitPrice === line.unitPrice,
    );
    if (match) {
      const quantity = (update.get(match.id)?.quantity ?? match.quantity) + line.quantity;
      if (quantity > SALE_QTY_MAX) return { ok: false, error: "quantity" };
      update.set(match.id, { id: match.id, quantity, lineTotal: quantity * match.unitPrice });
    } else create.push(line);
  }
  if (existing.length + create.length > SALE_LINES_MAX) return { ok: false, error: "too_many" };
  return { ok: true, update: [...update.values()], create };
}

export type CartLineOp = "inc" | "dec" | "remove";

export function isCartLineOp(value: unknown): value is CartLineOp {
  return value === "inc" || value === "dec" || value === "remove";
}

/**
 * Úprava řádku košíku: u merche +/− kus (0 = smazat řádek), u dohlášky jen odebrání celého
 * běžce. Vrací nový počet kusů (0 = smazat) nebo chybu.
 */
export function cartLineChange(
  line: { entry: boolean; quantity: number },
  op: CartLineOp,
): { ok: true; quantity: number } | { ok: false; error: "quantity" } {
  if (op === "remove") return { ok: true, quantity: 0 };
  if (line.entry) return { ok: false, error: "quantity" };
  const quantity = line.quantity + (op === "inc" ? 1 : -1);
  if (quantity > SALE_QTY_MAX) return { ok: false, error: "quantity" };
  return { ok: true, quantity: Math.max(0, quantity) };
}
