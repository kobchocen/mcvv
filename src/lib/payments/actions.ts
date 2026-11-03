"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { formInt, formString, toPaymentRegistrationId } from "@/lib/admin/parse";
import { requireStaff } from "@/lib/admin/staff";
import { HOME_COUNTS_TAG } from "@/lib/home/summary-core";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { entryTarget } from "@/lib/entries/changes-core";
import { recalculateRegistrationStatus } from "@/lib/entries/status";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";

function revalidate() {
  revalidatePath("/[locale]/admin/platby", "page");
  revalidatePath("/[locale]/admin/prihlasky", "layout");
  // valid (paid) registrations drive the homepage runner count
  revalidateTag(HOME_COUNTS_TAG, "max");
}

/** Označit nespárovaný pohyb jako vyřízený bez platby (např. jiný příjem klubu, vráceno). */
export async function ignoreBankTx(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = formInt(formData, "id");
  if (!id) return;
  const note = formString(formData, "note")?.slice(0, 500) ?? null;
  const ignored = await prisma.bankTx.updateMany({
    where: { id, status: "unmatched" },
    data: { status: "ignored", note, resolvedBy: session.email.slice(0, 64) },
  });
  if (ignored.count === 1) {
    await writeAudit({
      actor: session,
      action: "bank_tx.ignored",
      target: `bank_tx:${id}`,
      detail: { note },
    });
  }
  revalidate();
}

/**
 * Ručně přiřadit nespárovaný pohyb k přihlášce (vytvoří platbu, bez auto-potvrzení).
 * Zrušenou přihlášku nelze obnovit platbou – takový pohyb jde k vrácení.
 */
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
    select: { id: true, status: true },
  });
  if (!reg || reg.status === ENTRY_STATUS.cancelled) return;
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
  await writeAudit({
    actor: session,
    action: "payment.created",
    target: entryTarget(year, registrationId),
    detail: {
      paymentId: payment.id,
      bankTxId: id,
      amount: Math.round(Number(tx.amount)),
      date: tx.date.toISOString(),
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
  const refunded = await prisma.bankTx.updateMany({
    where: { id, overpaid: { gt: 0 }, refundedAt: null },
    data: { refundedAt: new Date(), resolvedBy: session.email.slice(0, 64) },
  });
  if (refunded.count === 1) {
    const row = await prisma.bankTx.findUnique({
      where: { id },
      select: { overpaid: true, year: true, registrationId: true },
    });
    await writeAudit({
      actor: session,
      action: "bank_tx.refunded",
      target: `bank_tx:${id}`,
      detail: {
        overpaid: row?.overpaid ?? null,
        registration:
          row?.year && row.registrationId !== null
            ? entryTarget(row.year, row.registrationId)
            : null,
      },
    });
  }
  revalidate();
}

/** Platba na zrušenou přihlášku (nespárovaný pohyb) vrácena plátci. */
export async function refundCancelledBankTx(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const id = formInt(formData, "id");
  if (!id) return;
  const refunded = await prisma.bankTx.updateMany({
    where: { id, status: "unmatched", reason: "cancelled" },
    data: {
      status: "ignored",
      refundedAt: new Date(),
      note: "vráceno – přihláška zrušena",
      resolvedBy: session.email.slice(0, 64),
    },
  });
  if (refunded.count === 1) {
    const row = await prisma.bankTx.findUnique({
      where: { id },
      select: { amount: true, year: true, registrationId: true },
    });
    await writeAudit({
      actor: session,
      action: "bank_tx.refunded",
      target: `bank_tx:${id}`,
      detail: {
        amount: row ? Math.round(Number(row.amount)) : null,
        reason: "cancelled",
        registration:
          row?.year && row.registrationId !== null
            ? entryTarget(row.year, row.registrationId)
            : null,
      },
    });
  }
  revalidate();
}

/** Platby, které přišly před automatickým zrušením přihlášky, vráceny plátci. */
export async function markEntryRefunded(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const year = formInt(formData, "year");
  const id = formInt(formData, "registrationId");
  if (!year || !id) return;
  const amount = formInt(formData, "amount");
  const refunded = await prisma.registrationMeta.updateMany({
    where: { year, id, autoCancelledAt: { not: null }, refundedAt: null },
    data: { refundedAt: new Date() },
  });
  if (refunded.count === 1) {
    await writeAudit({
      actor: session,
      action: "entry.refunded",
      target: entryTarget(year, id),
      detail: { amount },
    });
  }
  revalidate();
}
