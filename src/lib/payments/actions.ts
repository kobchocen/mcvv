"use server";

import { revalidatePath } from "next/cache";

import { formInt, formString, toPaymentRegistrationId } from "@/lib/admin/parse";
import { requireStaff } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { recalculateRegistrationStatus } from "@/lib/entries/status";

function revalidate() {
  revalidatePath("/[locale]/admin/platby", "page");
  revalidatePath("/[locale]/admin/prihlasky", "layout");
}

/** Označit nespárovaný pohyb jako vyřízený bez platby (např. jiný příjem klubu, vráceno). */
export async function ignoreBankTx(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = formInt(formData, "id");
  if (!id) return;
  await prisma.bankTx.updateMany({
    where: { id, status: "unmatched" },
    data: {
      status: "ignored",
      note: formString(formData, "note")?.slice(0, 500) ?? null,
      resolvedBy: session.email.slice(0, 64),
    },
  });
  revalidate();
}

/** Ručně přiřadit nespárovaný pohyb k přihlášce (vytvoří platbu, bez auto-potvrzení). */
export async function assignBankTx(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = formInt(formData, "id");
  const registrationId = formInt(formData, "registrationId");
  if (!id || !registrationId) return;
  const tx = await prisma.bankTx.findUnique({ where: { id } });
  if (!tx || tx.status !== "unmatched" || !tx.year) return;
  const year = formInt(formData, "year") ?? tx.year;
  const reg = await prisma.registration.findUnique({
    where: { year_id: { year, id: registrationId } },
    select: { id: true },
  });
  if (!reg) return;
  const claimed = await prisma.bankTx.updateMany({
    where: { id, status: "unmatched" },
    data: { status: "processing" },
  });
  if (claimed.count !== 1) return;
  const payment = await prisma.payment.create({
    data: {
      year,
      registrationId: toPaymentRegistrationId(registrationId),
      date: tx.date,
      amount: Math.round(Number(tx.amount)),
      author: "fio",
    },
    select: { id: true },
  });
  await prisma.bankTx.update({
    where: { id },
    data: {
      status: "matched",
      year,
      registrationId,
      paymentId: payment.id,
      resolvedBy: session.email.slice(0, 64),
    },
  });
  await recalculateRegistrationStatus(year, registrationId);
  revalidate();
}

/** Přeplatek vrácen. */
export async function markRefunded(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = formInt(formData, "id");
  if (!id) return;
  await prisma.bankTx.updateMany({
    where: { id, overpaid: { gt: 0 }, refundedAt: null },
    data: { refundedAt: new Date(), resolvedBy: session.email.slice(0, 64) },
  });
  revalidate();
}
