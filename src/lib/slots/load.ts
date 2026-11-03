import type { RegistrationSlot } from "@prisma/client";

import { prisma } from "@/lib/db/client";

import { entryFee, entryPrices, type FeeGroup, type Slot } from "./core";

export function slotFromRow(row: RegistrationSlot): Slot {
  return {
    type: row.type,
    from: row.from,
    to: row.to,
    active: row.active,
    feeAdult: row.feeAdult,
    feeYouth: row.feeYouth,
    payWithinMinutes: row.payWithinMinutes,
  };
}

/** Termíny přihlášek ročníku (prázdné = ročník bez slotů → dosavadní chování). */
export async function loadSlots(year: number): Promise<Slot[]> {
  const rows = await prisma.registrationSlot.findMany({ where: { year } });
  return rows.map(slotFromRow);
}

/** Skupina startovného kategorie (dospělí / mládež); null = kategorie bez skupiny. */
export async function categoryFeeGroup(categoryId: string): Promise<FeeGroup | null> {
  const row = await prisma.categoryMeta.findUnique({ where: { categoryId } });
  return row?.feeGroup ?? null;
}

/**
 * Startovné kategorie v existující přihlášce (nový běžec, přepočet v administraci): cena skupiny
 * uložená u přihlášky (Q342), u starších záznamů cena termínu, ve kterém vznikla; jinak číselník.
 */
export async function registrationCategoryFee(
  year: number,
  registrationId: number,
  category: { id: string; entryFee: number },
): Promise<number> {
  const [slots, group, meta] = await Promise.all([
    loadSlots(year),
    categoryFeeGroup(category.id),
    prisma.registrationMeta.findUnique({
      where: { year_id: { year, id: registrationId } },
      select: { slot: true, feeAdult: true, feeYouth: true },
    }),
  ]);
  return entryFee(entryPrices(meta, slots), group, category.entryFee);
}
