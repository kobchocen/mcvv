/**
 * Závodní kancelář – prodejky (#207). Čisté funkce bez DB a frameworku (testovatelné,
 * bezpečné i pro klientský bundle).
 *
 * VS prodejky = rok + "9" + pořadí prodejky v ročníku na 5 míst (např. 2026900001).
 * Má vždy 10 číslic, kdežto VS přihlášky je rok + číslo přihlášky 1–9999 (5–8 číslic,
 * viz `parseVs` v `lib/payments/match.ts`) → rozsahy se nemohou potkat.
 */

import { zonedCivilToUtc } from "@/lib/date/race-schedule";

export const SALE_STATUSES = ["unpaid", "paid_bank", "paid_cash", "cancelled"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export function isSaleStatus(value: unknown): value is SaleStatus {
  return typeof value === "string" && (SALE_STATUSES as readonly string[]).includes(value);
}

export function isSalePaid(status: string): boolean {
  return status === "paid_bank" || status === "paid_cash";
}

export const SALE_NUMBER_MAX = 99_999;
/** Max. kusů jedné položky na prodejce a max. řádků (ochrana proti překlepům). */
export const SALE_QTY_MAX = 99;
export const SALE_LINES_MAX = 30;
/** Rozumný strop ceny položky v Kč. */
export const SALE_PRICE_MAX = 100_000;
export const SALE_ITEM_NAME_MAX = 80;

export function saleVs(year: number, number: number): string {
  if (!Number.isInteger(number) || number < 1 || number > SALE_NUMBER_MAX) {
    throw new Error("sale number out of range");
  }
  return `${year}9${String(number).padStart(5, "0")}`;
}

/** Vrací pořadí prodejky z VS daného ročníku, jinak null. */
export function parseSaleVs(vs: string, year: number): number | null {
  const m = /^(\d{4})9(\d{5})$/.exec(vs.trim());
  if (!m || Number(m[1]) !== year) return null;
  const number = Number(m[2]);
  return number >= 1 ? number : null;
}

/** Zpráva pro příjemce v QR platbě (bez diakritiky, SPD). */
export function saleQrMessage(vs: string): string {
  return `MCVV PRODEJKA ${vs}`;
}

export type SaleItemPrice = { id: number; name: string; price: number; active: boolean };
export type SaleLineDraft = {
  itemId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type SaleLinesResult =
  | { ok: true; lines: SaleLineDraft[]; total: number }
  | { ok: false; error: "empty" | "quantity" | "item" | "too_many" };

/**
 * Řádky prodejky z požadavku obsluhy (id položky → kusy). Ceny a názvy bere jen
 * z ceníku na serveru; neaktivní nebo neznámá položka = chyba. Nulové kusy se vynechají.
 */
export function buildSaleLines(
  requested: ReadonlyArray<{ itemId: number; quantity: number }>,
  items: ReadonlyArray<SaleItemPrice>,
): SaleLinesResult {
  const byId = new Map(items.map((item) => [item.id, item]));
  const qty = new Map<number, number>();
  for (const r of requested) {
    if (!Number.isInteger(r.itemId) || !Number.isInteger(r.quantity) || r.quantity < 0) {
      return { ok: false, error: "quantity" };
    }
    if (r.quantity === 0) continue;
    qty.set(r.itemId, (qty.get(r.itemId) ?? 0) + r.quantity);
  }
  if (qty.size === 0) return { ok: false, error: "empty" };
  if (qty.size > SALE_LINES_MAX) return { ok: false, error: "too_many" };
  const lines: SaleLineDraft[] = [];
  for (const [itemId, quantity] of qty) {
    const item = byId.get(itemId);
    if (!item || !item.active) return { ok: false, error: "item" };
    if (quantity > SALE_QTY_MAX) return { ok: false, error: "quantity" };
    lines.push({
      itemId,
      name: item.name,
      unitPrice: item.price,
      quantity,
      lineTotal: item.price * quantity,
    });
  }
  // Pořadí jako v ceníku (stabilní pro tisk/přehled).
  const order = new Map(items.map((item, index) => [item.id, index]));
  lines.sort((a, b) => (order.get(a.itemId) ?? 0) - (order.get(b.itemId) ?? 0));
  return { ok: true, lines, total: lines.reduce((sum, line) => sum + line.lineTotal, 0) };
}

/** Celková cena z kusů na klientu (jen zobrazení; server počítá znovu přes buildSaleLines). */
export function cartTotal(
  items: ReadonlyArray<{ id: number; price: number }>,
  quantities: Readonly<Record<number, number>>,
): number {
  return items.reduce((sum, item) => sum + item.price * (quantities[item.id] ?? 0), 0);
}

export type SaleItemInput =
  | { ok: true; name: string; price: number; sortOrder: number }
  | { ok: false; error: "name" | "price" | "order" };

export function parseSaleItemInput(raw: {
  name: string;
  price: string;
  sortOrder: string;
}): SaleItemInput {
  const name = raw.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > SALE_ITEM_NAME_MAX) return { ok: false, error: "name" };
  const priceText = raw.price.trim().replace(/\s/g, "");
  if (!/^\d{1,6}$/.test(priceText)) return { ok: false, error: "price" };
  const price = Number(priceText);
  if (price > SALE_PRICE_MAX) return { ok: false, error: "price" };
  const orderText = raw.sortOrder.trim() || "0";
  if (!/^-?\d{1,4}$/.test(orderText)) return { ok: false, error: "order" };
  return { ok: true, name, price, sortOrder: Number(orderText) };
}

// ---------------------------------------------------------------------------
// Párování plateb z Fio
// ---------------------------------------------------------------------------

export type SaleMatchReason = "sale_not_found" | "sale_amount" | "sale_cancelled" | "sale_paid";

export type SaleSnapshot = { id: number; total: number; status: string } | null;

export type SaleMatchDecision =
  | { kind: "not_sale" }
  | { kind: "unmatched"; reason: SaleMatchReason | "currency" | "fraction"; saleId: number | null }
  | { kind: "matched"; saleId: number; amount: number };

/**
 * Rozhodnutí pro příchozí pohyb, jehož VS je VS prodejky ročníku. Páruje se jen
 * přesná částka v CZK na nezaplacenou prodejku; vše ostatní jde k ruční kontrole.
 * `not_sale` = VS není prodejka → pokračuje dosavadní párování přihlášek.
 */
export function matchSaleTransaction(
  tx: { amount: number; currency: string; vs: string | null },
  year: number,
  sale: (number: number) => SaleSnapshot,
): SaleMatchDecision {
  if (!(tx.amount > 0) || !tx.vs) return { kind: "not_sale" };
  const number = parseSaleVs(tx.vs, year);
  if (number === null) return { kind: "not_sale" };
  const found = sale(number);
  const saleId = found?.id ?? null;
  if (tx.currency !== "CZK") return { kind: "unmatched", reason: "currency", saleId };
  if (!Number.isInteger(tx.amount)) return { kind: "unmatched", reason: "fraction", saleId };
  if (!found) return { kind: "unmatched", reason: "sale_not_found", saleId: null };
  if (found.status === "cancelled") return { kind: "unmatched", reason: "sale_cancelled", saleId };
  if (isSalePaid(found.status)) return { kind: "unmatched", reason: "sale_paid", saleId };
  if (tx.amount !== found.total) return { kind: "unmatched", reason: "sale_amount", saleId };
  return { kind: "matched", saleId: found.id, amount: tx.amount };
}

// ---------------------------------------------------------------------------
// Přehled a denní součty
// ---------------------------------------------------------------------------

/** Kalendářní den v Praze (YYYY-MM-DD). */
export function pragueDay(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export type SaleSummaryRow = { status: string; total: number; createdAt: Date };
export type DaySummary = {
  day: string;
  count: number;
  paidCash: number;
  paidBank: number;
  unpaid: number;
  cancelled: number;
};

/** Součty po dnech (Praha), nejnovější den první. Storna se do peněz nepočítají. */
export function dailySummary(rows: ReadonlyArray<SaleSummaryRow>): DaySummary[] {
  const days = new Map<string, DaySummary>();
  for (const row of rows) {
    const day = pragueDay(row.createdAt);
    const d = days.get(day) ?? {
      day,
      count: 0,
      paidCash: 0,
      paidBank: 0,
      unpaid: 0,
      cancelled: 0,
    };
    if (row.status === "cancelled") d.cancelled += 1;
    else {
      d.count += 1;
      if (row.status === "paid_cash") d.paidCash += row.total;
      else if (row.status === "paid_bank") d.paidBank += row.total;
      else d.unpaid += row.total;
    }
    days.set(day, d);
  }
  return [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** Hranice dne v Praze jako UTC interval [from, to) pro filtr podle dne. */
export function pragueDayRange(day: string): { from: Date; to: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d, 12));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  return {
    from: zonedCivilToUtc(y, mo, d, 0, 0, 0),
    to: zonedCivilToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0),
  };
}

export type SaleFilter = {
  status: SaleStatus | "paid" | null;
  day: string | null;
  creator: string;
};

export function parseSaleFilter(raw: {
  stav?: string | string[];
  den?: string | string[];
  kdo?: string | string[];
}): SaleFilter {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const status = one(raw.stav);
  const day = one(raw.den);
  return {
    status: status === "paid" || isSaleStatus(status) ? status : null,
    day: pragueDayRange(day) ? day : null,
    creator: one(raw.kdo).trim().slice(0, 80),
  };
}
