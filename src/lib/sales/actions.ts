"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { formInt, formString } from "@/lib/admin/parse";
import { currentRaceYear } from "@/lib/entries/year";
import { HOME_COUNTS_TAG } from "@/lib/home/summary-core";

import { parseSaleItemInput } from "./core";
import { cashDeskActionSession, saleStatusSection } from "./guard";
import { createOnsiteEntry, suggestOnsiteBibFor, type CreateOnsiteEntryResult } from "./onsite";
import { parseOnsiteEntryInput, type OnsiteEntryField } from "./onsite-core";
import {
  changeSaleStatus,
  createSale,
  createSaleItem,
  updateSaleItem,
  type CreateSaleResult,
} from "./sales";

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
] as const;

/**
 * Pokladna: dohláška na místě (#222) – založí přihlášku s ručně zadaným číslem a prodejku
 * s cenou termínu „na místě“, propojené spolu.
 */
export async function createOnsiteEntryAction(
  input: Partial<Record<(typeof ONSITE_FIELDS)[number], string>>,
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
  const result = await createOnsiteEntry(session, year, parsed.data);
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

/** Pokladna: vytvořit prodejku z vybraných položek (ceny počítá server). */
export async function createSaleAction(input: {
  lines: ReadonlyArray<{ itemId: number; quantity: number }>;
}): Promise<CreateSaleResult | { ok: false; error: "forbidden" }> {
  const session = await cashDeskActionSession();
  if (!session) return { ok: false, error: "forbidden" };
  const lines = Array.isArray(input?.lines) ? input.lines.slice(0, 100) : [];
  const { year } = await currentRaceYear();
  const result = await createSale(
    session,
    year,
    lines.map((l) => ({ itemId: Number(l?.itemId), quantity: Number(l?.quantity) })),
  );
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
