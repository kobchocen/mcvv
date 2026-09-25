"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formDate, formInt, formString, toPaymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { redirect } from "@/i18n/routing";

function revalidateRegistrations() {
  revalidatePath("/[locale]/admin/prihlasky", "layout");
}

export async function saveRegistrationHeader(formData: FormData): Promise<void> {
  await requireStaff();
  const year = formInt(formData, "year");
  const id = formInt(formData, "id");
  if (!year || id === null) {
    return;
  }
  await prisma.registration.update({
    where: { year_id: { year, id } },
    data: {
      email: formString(formData, "email") || null,
      name: formString(formData, "name") || null,
      note: formString(formData, "note") || null,
      promotion: formString(formData, "promotion") || null,
    },
  });
  revalidateRegistrations();
}

export async function savePayment(formData: FormData): Promise<void> {
  await requireStaff();
  const year = formInt(formData, "year");
  const registrationId = formInt(formData, "registrationId");
  const paymentId = formInt(formData, "paymentId");
  const amount = formInt(formData, "amount");
  const date = formDate(formData, "date");
  if (!year || registrationId === null || amount === null) {
    return;
  }
  const payload = {
    year,
    registrationId: toPaymentRegistrationId(registrationId),
    amount,
    date,
  };
  if (paymentId) {
    await prisma.payment.update({ where: { id: paymentId }, data: payload });
  } else {
    await prisma.payment.create({ data: payload });
  }
  revalidateRegistrations();
  const locale = await getLocale();
  redirect({
    href: {
      pathname: "/admin/prihlasky/[rok]/[id]",
      params: { rok: String(year), id: String(registrationId) },
    },
    locale,
  });
}

export async function deletePayment(formData: FormData): Promise<void> {
  await requireStaff();
  const year = formInt(formData, "year");
  const registrationId = formInt(formData, "registrationId");
  const paymentId = formInt(formData, "paymentId");
  if (!paymentId) {
    return;
  }
  await prisma.payment.delete({ where: { id: paymentId } });
  revalidateRegistrations();
  if (year && registrationId !== null) {
    const locale = await getLocale();
    redirect({
      href: {
        pathname: "/admin/prihlasky/[rok]/[id]",
        params: { rok: String(year), id: String(registrationId) },
      },
      locale,
    });
  }
}
