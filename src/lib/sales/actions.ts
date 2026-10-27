"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { formInt, formString } from "@/lib/admin/parse";
import { canManageSaleItems, canMarkSalePaidBank } from "@/lib/auth/roles";
import { currentRaceYear } from "@/lib/entries/year";

import { parseSaleItemInput } from "./core";
import { cashDeskActionSession } from "./guard";
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
  const session = await cashDeskActionSession(to === "paid_bank" ? canMarkSalePaidBank : undefined);
  const id = formInt(formData, "id");
  if (!id) return;
  if (!session) return toSale(id, { chyba: "forbidden" });
  const result = await changeSaleStatus(session, id, to, formString(formData, "note") ?? undefined);
  revalidate();
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
  const session = await cashDeskActionSession(canManageSaleItems);
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
  const session = await cashDeskActionSession(canManageSaleItems);
  if (!session) return toItems({ chyba: "forbidden" });
  const id = formInt(formData, "id");
  if (!id) return toItems({ chyba: "not_found" });
  const active = formString(formData, "active") === "1";
  const ok = await updateSaleItem(session, id, { active });
  revalidate();
  return toItems(ok ? { ok: active ? "activated" : "deactivated" } : { chyba: "not_found" });
}
