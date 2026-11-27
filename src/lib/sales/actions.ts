"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { formInt, formString } from "@/lib/admin/parse";
import { currentRaceYear } from "@/lib/entries/year";
import { HOME_COUNTS_TAG } from "@/lib/home/summary-core";

import { parseSaleItemInput } from "./core";
import { cashDeskActionSession, saleStatusSection } from "./guard";
import {
  addMerchToCart,
  changeCartLine,
  closeCartForPayment,
  reopenCart,
  type AddMerchResult,
  type CartLineResult,
  type CheckoutResult,
} from "./cart";
import { isCartLineOp } from "./cart-core";
import { addOnsiteRunnerToCart, suggestOnsiteBibFor, type CreateOnsiteEntryResult } from "./onsite";
import { parseOnsiteEntryInput, type OnsiteEntryField } from "./onsite-core";
import { changeSaleStatus, createSaleItem, sendSaleReceipt, updateSaleItem } from "./sales";

function revalidate() {
  revalidatePath("/[locale]/kancelar", "layout");
}

/** Dohláška na místě mění i přihlášky a startovku (#222). */
function revalidateEntries() {
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
  revalidatePath("/[locale]", "page");
  revalidateTag(HOME_COUNTS_TAG, "max");
}

const ONSITE_FIELDS = [
  "firstName",
  "lastName",
  "birthYear",
  "sex",
  "categoryId",
  "clubName",
  "nationality",
  "bib",
  "bibAuto",
  "email",
  "receiptEmail",
  "receiptLocale",
] as const;

/** Id košíku z klienta: kladné celé číslo, jinak null (= založit nový košík). */
function cartId(value: unknown): number | null {
  const id = typeof value === "number" ? value : Number(value);
  return Number.isInteger(id) && id > 0 && id < 1_000_000_000 ? id : null;
}

/**
 * Pokladna: dohláška na místě (#222) do otevřeného košíku (#378) – rezervuje číslo, přidá
 * běžce do přihlášky košíku (první založí přihlášku i košík) a řádek prodejky s cenou termínu
 * „na místě“. K platbě se nepřechází.
 */
export async function addOnsiteRunnerAction(
  input: Partial<Record<(typeof ONSITE_FIELDS)[number], string>>,
  saleId: number | null,
): Promise<
  | CreateOnsiteEntryResult
  | { ok: false; error: "forbidden" }
  | { ok: false; error: "invalid"; field: OnsiteEntryField }
> {
  const session = await cashDeskActionSession();
  if (!session) return { ok: false, error: "forbidden" };
  const raw: Record<string, string> = {};
  for (const key of ONSITE_FIELDS) {
    const value = input?.[key];
    if (typeof value === "string") raw[key] = value.slice(0, 200);
  }
  const parsed = parseOnsiteEntryInput(raw);
  if (!parsed.ok) return parsed;
  const { year } = await currentRaceYear();
  const result = await addOnsiteRunnerToCart(session, year, parsed.data, cartId(saleId));
  if (result.ok) {
    revalidate();
    revalidateEntries();
  }
  return result;
}

/** Pokladna: návrh nejbližšího volného čísla pro kategorii dohlášky (#222). */
export async function suggestOnsiteBibAction(
  categoryId: string,
): Promise<{ bib: number; outsideCategory: boolean } | null> {
  const session = await cashDeskActionSession();
  if (!session || typeof categoryId !== "string" || !/^[A-Za-z0-9]$/.test(categoryId)) {
    return null;
  }
  const { year } = await currentRaceYear();
  const suggestion = await suggestOnsiteBibFor(year, categoryId);
  return suggestion ? { bib: suggestion.bib, outsideCategory: suggestion.outsideCategory } : null;
}

/** Pokladna: položky ceníku do otevřeného košíku (ceny počítá server z ceníku). */
export async function addMerchAction(input: {
  lines: ReadonlyArray<{ itemId: number; quantity: number }>;
  saleId: number | null;
}): Promise<AddMerchResult | { ok: false; error: "forbidden" }> {
  const session = await cashDeskActionSession();
  if (!session) return { ok: false, error: "forbidden" };
  const lines = Array.isArray(input?.lines) ? input.lines.slice(0, 100) : [];
  const { year } = await currentRaceYear();
  const result = await addMerchToCart(
    session,
    year,
    lines.map((l) => ({ itemId: Number(l?.itemId), quantity: Number(l?.quantity) })),
    cartId(input?.saleId),
  );
  if (result.ok) revalidate();
  return result;
}

/** Pokladna: +/− kus merche nebo odebrání řádku (u dohlášky uvolní jen číslo toho běžce). */
export async function changeCartLineAction(input: {
  saleId: number;
  lineId: number;
  op: string;
}): Promise<CartLineResult | { ok: false; error: "forbidden" }> {
  const session = await cashDeskActionSession();
  if (!session) return { ok: false, error: "forbidden" };
  const saleId = cartId(input?.saleId);
  const lineId = cartId(input?.lineId);
  if (!saleId || !lineId || !isCartLineOp(input?.op)) return { ok: false, error: "not_found" };
  const result = await changeCartLine(session, saleId, lineId, input.op);
  if (result.ok) {
    revalidate();
    if (result.released != null) revalidateEntries();
  }
  return result;
}

/** Pokladna: „K platbě“ – uzavře košík, uloží e-mail účtenky; klient pak otevře detail s QR. */
export async function checkoutCartAction(input: {
  saleId: number;
  email?: string;
  locale?: string;
}): Promise<CheckoutResult | { ok: false; error: "forbidden" }> {
  const session = await cashDeskActionSession();
  if (!session) return { ok: false, error: "forbidden" };
  const saleId = cartId(input?.saleId);
  if (!saleId) return { ok: false, error: "cart_closed" };
  const email = typeof input?.email === "string" ? input.email.trim().slice(0, 128) : "";
  const result = await closeCartForPayment(session, saleId, {
    email,
    locale: typeof input?.locale === "string" ? input.locale : null,
  });
  if (result.ok) revalidate();
  return result;
}

async function toSale(id: number, query: Record<string, string>): Promise<never> {
  const locale = await getLocale();
  redirect({
    href: { pathname: "/kancelar/prodejky/[id]", params: { id: String(id) }, query },
    locale,
  });
  throw new Error("redirect");
}

async function changeStatus(formData: FormData, to: "paid_cash" | "paid_bank" | "cancelled") {
  const session = await cashDeskActionSession(saleStatusSection(to));
  const id = formInt(formData, "id");
  if (!id) return;
  if (!session) return toSale(id, { chyba: "forbidden" });
  const result = await changeSaleStatus(session, id, to, formString(formData, "note") ?? undefined);
  revalidate();
  if (result === "ok") revalidateEntries();
  if (result !== "ok") return toSale(id, { chyba: result });
  // Účtenka (#223): po zaplacení ji pošleme automaticky, pokud prodejka má e-mail.
  if (to !== "cancelled") {
    const receipt = await sendSaleReceipt(session, id);
    if (receipt === "ok") return toSale(id, { ok: to, uctenka: "1" });
  }
  return toSale(id, { ok: to });
}

export async function markSalePaidCash(formData: FormData): Promise<void> {
  await changeStatus(formData, "paid_cash");
}

export async function markSalePaidBank(formData: FormData): Promise<void> {
  await changeStatus(formData, "paid_bank");
}

export async function cancelSale(formData: FormData): Promise<void> {
  await changeStatus(formData, "cancelled");
}

/** Detail prodejky: nezaplacenou prodejku vrátit do košíku k úpravám (#378). */
export async function reopenCartAction(formData: FormData): Promise<void> {
  const session = await cashDeskActionSession();
  const id = formInt(formData, "id");
  if (!id) return;
  if (!session) return toSale(id, { chyba: "forbidden" });
  const result = await reopenCart(session, id);
  revalidate();
  if (result !== "ok") return toSale(id, { chyba: result });
  const locale = await getLocale();
  redirect({ href: { pathname: "/kancelar", query: { prodejka: String(id) } }, locale });
}

async function toItems(query: Record<string, string>): Promise<never> {
  const locale = await getLocale();
  redirect({ href: { pathname: "/kancelar/polozky", query }, locale });
  throw new Error("redirect");
}

/** Ceník: nová položka nebo úprava (id). Jen admin. */
export async function saveSaleItem(formData: FormData): Promise<void> {
  const session = await cashDeskActionSession("raceOffice.items");
  if (!session) return toItems({ chyba: "forbidden" });
  const parsed = parseSaleItemInput({
    name: formString(formData, "name") ?? "",
    price: formString(formData, "price") ?? "",
    sortOrder: formString(formData, "sortOrder") ?? "",
  });
  if (!parsed.ok) return toItems({ chyba: parsed.error });
  const id = formInt(formData, "id");
  const input = { name: parsed.name, price: parsed.price, sortOrder: parsed.sortOrder };
  if (id) {
    const ok = await updateSaleItem(session, id, input);
    revalidate();
    return toItems(ok ? { ok: "updated" } : { chyba: "not_found" });
  }
  const { year } = await currentRaceYear();
  await createSaleItem(session, year, input);
  revalidate();
  return toItems({ ok: "created" });
}

/** Ceník: aktivovat / deaktivovat položku (neaktivní se v pokladně nenabízí). Jen admin. */
export async function toggleSaleItem(formData: FormData): Promise<void> {
  const session = await cashDeskActionSession("raceOffice.items");
  if (!session) return toItems({ chyba: "forbidden" });
  const id = formInt(formData, "id");
  if (!id) return toItems({ chyba: "not_found" });
  const active = formString(formData, "active") === "1";
  const ok = await updateSaleItem(session, id, { active });
  revalidate();
  return toItems(ok ? { ok: active ? "activated" : "deactivated" } : { chyba: "not_found" });
}

/** Poslat (znovu) účtenku e-mailem z detailu prodejky (#223). */
export async function sendSaleReceiptAction(formData: FormData): Promise<void> {
  const session = await cashDeskActionSession();
  const id = formInt(formData, "id");
  if (!id) return;
  if (!session) return toSale(id, { chyba: "forbidden" });
  const result = await sendSaleReceipt(session, id, {
    email: formString(formData, "email"),
    locale: formString(formData, "locale"),
  });
  revalidate();
  if (result !== "ok") return toSale(id, { chyba: result });
  return toSale(id, { ok: "receipt" });
}
