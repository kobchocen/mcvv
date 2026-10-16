"use server";

import { revalidatePath } from "next/cache";

import { requireStaff } from "@/lib/admin/staff";
import { formInt, formString } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";

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

export async function saveClub(formData: FormData): Promise<void> {
  await requireStaff();
  const id = formString(formData, "id").slice(0, 3).toUpperCase();
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
}
