"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formDate, formInt, formString, toPaymentRegistrationId } from "@/lib/admin/parse";
import { computeLineFee, paidAmount } from "@/lib/entries/fee";
import { ENTRY_STATUS, recalculateRegistrationStatus } from "@/lib/entries/status";
import { confirmRegistrationCore } from "@/lib/entries/confirm";
import { canCancelRegistration } from "@/lib/entries/empty-registrations";
import { cancellationDetail } from "@/lib/entries/cancel-core";
import { entryTarget } from "@/lib/entries/changes-core";
import { writeAudit } from "@/lib/audit/log";
import { diffFields } from "@/lib/audit/diff";
import { isPromotionOptOut, promotionValue } from "@/lib/entries/promotion";
import { setAccountPromotionOptOut } from "@/lib/entries/account-promotion";
import { prisma } from "@/lib/db/client";
import { redirect } from "@/i18n/routing";

function revalidateRegistrations() {
  revalidatePath("/[locale]/admin/prihlasky", "layout");
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
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
  const session = await requireStaff();
  const year = formInt(formData, "year");
  const id = formInt(formData, "id");
  if (!year || id === null) {
    return;
  }
  const email = formString(formData, "email").toLowerCase() || null;
  const before = await prisma.registration.findUnique({
    where: { year_id: { year, id } },
    select: { promotion: true, email: true, name: true },
  });
  const noNewsletter = formString(formData, "noNewsletter") === "N";
  const data = {
    email,
    name: formString(formData, "name") || null,
    // Poznámka se už needituje (nahradily ji zprávy #108); sloupec zůstává jen ke čtení.
    promotion: promotionValue(noNewsletter),
  };
  await prisma.registration.update({ where: { year_id: { year, id } }, data });
  const changes = diffFields(before, data);
  if (Object.keys(changes).length > 0) {
    await writeAudit({
      actor: session,
      action: "registration.updated",
      target: entryTarget(year, id),
      detail: { changes },
    });
  }
  // Souhlas patří účtu: změnu provedenou pořadatelem promítnout i do účtu (jen při změně,
  // aby úprava staré přihlášky nepřepsala novější rozhodnutí na účtu).
  if (email && before && isPromotionOptOut(before.promotion) !== noNewsletter) {
    await setAccountPromotionOptOut(email, noNewsletter);
  }
  if (email) {
    await refreshLineFees(year, id, email);
  }
  await recalculateRegistrationStatus(year, id);
  revalidateRegistrations();
}

export async function savePayment(formData: FormData): Promise<void> {
  const session = await requireStaff();
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
    const before = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { year: true, registrationId: true, amount: true, date: true },
    });
    await prisma.payment.update({ where: { id: paymentId }, data: payload });
    const changes = diffFields(before, payload);
    if (Object.keys(changes).length > 0) {
      await writeAudit({
        actor: session,
        action: "payment.updated",
        target: entryTarget(year, registrationId),
        detail: { paymentId, changes },
      });
    }
  } else {
    const created = await prisma.payment.create({ data: payload, select: { id: true } });
    await writeAudit({
      actor: session,
      action: "payment.created",
      target: entryTarget(year, registrationId),
      detail: { paymentId: created.id, changes: diffFields(null, payload) },
    });
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
  const session = await requireStaff();
  const year = formInt(formData, "year");
  const registrationId = formInt(formData, "registrationId");
  const paymentId = formInt(formData, "paymentId");
  if (!paymentId) {
    return;
  }
  await prisma.$transaction(async (tx) => {
    const row = await tx.payment.delete({ where: { id: paymentId } });
    // Plný stav smazané platby, aby šla ručně obnovit.
    await writeAudit(
      {
        actor: session,
        action: "payment.deleted",
        target: entryTarget(row.year, Number(row.registrationId)),
        detail: {
          paymentId,
          deleted: {
            year: row.year,
            registrationId: row.registrationId,
            amount: row.amount,
            date: row.date?.toISOString() ?? null,
            created: row.created.toISOString(),
            author: row.author,
          },
        },
      },
      tx,
    );
  });
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
  const session = await requireStaff();
  const year = formInt(formData, "year");
  const id = formInt(formData, "id");
  if (!year || id === null) {
    return;
  }
  const paid = await paidAmount(year, id);
  // Zrušení smaže řádky (závodníky) – PK řádku je (rok, běžec), takže jinak by závodníka
  // nešlo přihlásit znovu jinou přihláškou. Hlavička zůstává ve stavu 0, platby zůstávají
  // navázané na přihlášku (případné vrácení řeší pořadatel ručně). Odhlášené závodníky
  // zapíše audit `entry.cancelled`.
  await prisma.$transaction(async (tx) => {
    const row = await tx.registration.findUnique({
      where: { year_id: { year, id } },
      select: {
        status: true,
        name: true,
        lines: {
          select: {
            runnerId: true,
            entryFee: true,
            runner: { select: { name: true } },
            category: { select: { name: true } },
          },
        },
      },
    });
    // Prázdnou přihlášku nerušit – nic neblokuje a přihlašujícího by „zasekla“.
    if (!row || !canCancelRegistration({ status: row.status, lineCount: row.lines.length })) {
      return;
    }
    await tx.registrationLine.deleteMany({ where: { year, registrationId: id } });
    await tx.registration.update({
      where: { year_id: { year, id } },
      data: { status: ENTRY_STATUS.cancelled },
    });
    await writeAudit(
      {
        actor: session,
        action: "entry.cancelled",
        target: entryTarget(year, id),
        detail: cancellationDetail({
          year,
          registrationId: id,
          registrationName: row.name,
          lines: row.lines,
          paid,
        }),
      },
      tx,
    );
  });
  revalidateRegistrations();
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
}

export async function confirmRegistration(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const year = formInt(formData, "year");
  const id = formInt(formData, "id");
  if (!year || id === null) {
    return;
  }
  const result = await confirmRegistrationCore(year, id);
  if (result === "not_confirmable") {
    return;
  }
  const sent = result === "confirmed";
  await writeAudit({
    actor: session,
    action: "registration.confirmed",
    target: entryTarget(year, id),
    detail: { mailSent: sent },
  });
  revalidateRegistrations();
  const locale = await getLocale();
  if (formString(formData, "from") === "list") {
    redirect({
      href: { pathname: "/admin/prihlasky", query: { rok: String(year) } },
      locale,
    });
  }
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
