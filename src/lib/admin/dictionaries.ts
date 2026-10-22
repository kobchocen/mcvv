"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formInt, formString } from "@/lib/admin/parse";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { redirect } from "@/i18n/routing";
import { recalculateCategoryRecords } from "@/lib/stats/records";
import { CLUB_ID_MAX_LENGTH } from "@/lib/entries/club-id";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";

function revalidateDicts() {
  revalidatePath("/[locale]/admin/ciselniky", "layout");
}

export async function saveCategory(formData: FormData): Promise<void> {
  await requireStaff();
  const id = formString(formData, "id").slice(0, 1);
  if (!id) {
    return;
  }
  const data = {
    name: formString(formData, "name").slice(0, 20) || id,
    age: formInt(formData, "age") ?? 0,
    sort: formInt(formData, "sort") ?? 0,
    sex: formString(formData, "sex").slice(0, 1) || "M",
    record: formInt(formData, "record") ?? 0,
    entryFee: formInt(formData, "entryFee") ?? 0,
    bibFrom: formInt(formData, "bibFrom") ?? 0,
    bibTo: formInt(formData, "bibTo") ?? 0,
  };
  await prisma.category.upsert({
    where: { id },
    update: data,
    create: { id, ...data },
  });
  revalidateDicts();
}

/** Ruční přepočet rekordů kategorií ze všech výsledků (#129), stejně jako po importu. */
export async function recalculateRecords(): Promise<void> {
  const session = await requireStaff();
  const locale = await getLocale();
  const records = await prisma.$transaction(async (tx) => {
    const changes = await recalculateCategoryRecords(tx);
    await writeAudit(
      {
        actor: session,
        action: "category.records_recalculated",
        target: "categories",
        detail: { records: changes },
      },
      tx,
    );
    return changes;
  });
  revalidateDicts();
  redirect({
    href: {
      pathname: "/admin/ciselniky/kategorie",
      query: { rekordy: records.map((r) => r.id).join(",") || "-" },
    },
    locale,
  });
}

export async function saveClub(formData: FormData): Promise<void> {
  await requireStaff();
  const id = formString(formData, "id").slice(0, CLUB_ID_MAX_LENGTH).toUpperCase();
  const year = formInt(formData, "year");
  const name = formString(formData, "name").slice(0, 50);
  if (!id || !year || !name) {
    return;
  }
  await prisma.club.upsert({
    where: { id_year: { id, year } },
    update: { name },
    create: { id, year, name },
  });
  revalidateDicts();
  // Club names are shown on the public club list and profiles (cached under "stats").
  revalidatePath("/[locale]/kluby", "layout");
  revalidateTag(STATS_CACHE_TAG, "max");
}
