"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formDate, formInt, formString } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { redirect } from "@/i18n/routing";

function revalidateEditions() {
  revalidatePath("/[locale]/admin", "layout");
  revalidatePath("/[locale]/admin/rocniky", "page");
}

function feeFields(data: FormData) {
  return {
    startKidsMail: formInt(data, "startKidsMail"),
    startKidsPlace: formInt(data, "startKidsPlace"),
    startAdultMail: formInt(data, "startAdultMail"),
    startAdultPlace: formInt(data, "startAdultPlace"),
    startInterval: formInt(data, "startInterval"),
    finAdult1: formInt(data, "finAdult1"),
    finAdult2: formInt(data, "finAdult2"),
    finAdult3: formInt(data, "finAdult3"),
    finAdult4: formInt(data, "finAdult4"),
    finAdult5: formInt(data, "finAdult5"),
    finVet1: formInt(data, "finVet1"),
    finVet2: formInt(data, "finVet2"),
    finVet3: formInt(data, "finVet3"),
  };
}

export async function saveEdition(formData: FormData): Promise<void> {
  await requireStaff();
  const id = formInt(formData, "id");
  const date = formDate(formData, "date");
  if (!date) {
    return;
  }
  const payload = {
    date,
    regDeadline: formDate(formData, "regDeadline"),
    weather: formString(formData, "weather") || null,
    temp: formInt(formData, "temp"),
    ...feeFields(formData),
  };

  if (id) {
    await prisma.edition.update({ where: { id }, data: payload });
  } else {
    await prisma.edition.create({ data: payload });
  }

  revalidateEditions();
  const locale = await getLocale();
  redirect({ href: "/admin/rocniky", locale });
}
