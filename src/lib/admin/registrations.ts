"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formDate, formInt, formString, toPaymentRegistrationId } from "@/lib/admin/parse";
import { computeLineFee, paidAmount } from "@/lib/entries/fee";
import { ENTRY_STATUS, recalculateRegistrationStatus } from "@/lib/entries/status";
import { sendConfirmationEmail } from "@/lib/entries/confirm-mail";
import { prisma } from "@/lib/db/client";
import { redirect } from "@/i18n/routing";

function revalidateRegistrations() {
  revalidatePath("/[locale]/admin/prihlasky", "layout");
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/startovka", "page");
  revalidatePath("/[locale]", "page");
}

async function refreshLineFees(year: number, id: number, email: string): Promise<void> {
  const lines = await prisma.registrationLine.findMany({
    where: { year, registrationId: id },
    include: { category: { select: { entryFee: true } } },
  });
  for (const line of lines) {
    const { fee } = await computeLineFee(email, line.runnerId, line.category.entryFee);
    if (fee !== (line.entryFee ?? 0)) {
      await prisma.registrationLine.update({
        where: { year_runnerId: { year, runnerId: line.runnerId } },
        data: { entryFee: fee },
      });
    }
  }
}

export async function saveRegistrationHeader(formData: FormData): Promise<void> {
  await requireStaff();
  const year = formInt(formData, "year");
  const id = formInt(formData, "id");
  if (!year || id === null) {
    return;
  }
  const email = formString(formData, "email").toLowerCase() || null;
  await prisma.registration.update({
    where: { year_id: { year, id } },
    data: {
      email,
      name: formString(formData, "name") || null,
      note: formString(formData, "note") || null,
      promotion: formString(formData, "promotion") || null,
    },
  });
  if (email) {
    await refreshLineFees(year, id, email);
  }
  await recalculateRegistrationStatus(year, id);
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
  await recalculateRegistrationStatus(year, registrationId);
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
  if (year && registrationId !== null) {
    await recalculateRegistrationStatus(year, registrationId);
  }
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

export async function cancelRegistration(formData: FormData): Promise<void> {
  await requireStaff();
  const year = formInt(formData, "year");
  const id = formInt(formData, "id");
  if (!year || id === null) {
    return;
  }
  const row = await prisma.registration.findUnique({ where: { year_id: { year, id } } });
  if (!row || (row.status !== ENTRY_STATUS.empty && row.status !== ENTRY_STATUS.unpaid)) {
    return;
  }
  await prisma.registration.update({
    where: { year_id: { year, id } },
    data: { status: ENTRY_STATUS.cancelled },
  });
  revalidateRegistrations();
}

export async function confirmRegistration(formData: FormData): Promise<void> {
  await requireStaff();
  const year = formInt(formData, "year");
  const id = formInt(formData, "id");
  if (!year || id === null) {
    return;
  }
  const row = await prisma.registration.findUnique({
    where: { year_id: { year, id } },
    include: {
      lines: {
        include: {
          runner: { select: { name: true } },
          club: { select: { name: true } },
          category: { select: { name: true } },
        },
        orderBy: { runnerId: "asc" },
      },
    },
  });
  if (!row || (row.status !== ENTRY_STATUS.paid && row.status !== ENTRY_STATUS.overpaid)) {
    return;
  }
  const paidTotal = await paidAmount(year, id);
  const fee = row.lines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0);
  await prisma.registration.update({
    where: { year_id: { year, id } },
    data: { status: ENTRY_STATUS.confirmed },
  });
  const sent = await sendConfirmationEmail({
    year,
    id,
    email: row.email,
    name: row.name,
    lines: row.lines.map((line) => ({
      runner: line.runner.name,
      club: line.club.name,
      category: line.category.name,
      fee: line.entryFee ?? 0,
    })),
    fee,
    paid: paidTotal,
  });
  revalidateRegistrations();
  const locale = await getLocale();
  if (!sent) {
    redirect({
      href: {
        pathname: "/admin/prihlasky/[rok]/[id]",
        params: { rok: String(year), id: String(id) },
        query: { mail: "0" },
      },
      locale,
    });
  }
  redirect({
    href: {
      pathname: "/admin/prihlasky/[rok]/[id]",
      params: { rok: String(year), id: String(id) },
    },
    locale,
  });
}
