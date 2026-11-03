"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { formInt } from "@/lib/admin/parse";
import { requireStaff } from "@/lib/admin/staff";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { cancellationDetail } from "@/lib/entries/cancel-core";
import { entryTarget } from "@/lib/entries/changes-core";
import { paidAmount } from "@/lib/entries/fee";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";
import { HOME_COUNTS_TAG } from "@/lib/home/summary-core";
import { extendedPayUntil, lateAdminActionsAllowed } from "@/lib/slots/late-core";
import { lateCancelOffers, mailSite, sendLateCancelMail } from "@/lib/slots/late-mail";
import { hasMailAddress } from "@/lib/slots/standard-pay-core";
import { redirect } from "@/i18n/routing";

function revalidateEntry() {
  revalidatePath("/[locale]/admin/prihlasky", "layout");
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
  revalidatePath("/[locale]", "page");
  revalidateTag(HOME_COUNTS_TAG, "max");
}

async function backToDetail(year: number, id: number, late: "extended" | "cancelled" | "stale") {
  const locale = await getLocale();
  redirect({
    href: {
      pathname: "/admin/prihlasky/[rok]/[id]",
      params: { rok: String(year), id: String(id) },
      query: { late },
    },
    locale,
  });
}

async function loadLate(year: number, id: number) {
  const [reg, meta] = await Promise.all([
    prisma.registration.findUnique({
      where: { year_id: { year, id } },
      select: { status: true },
    }),
    prisma.registrationMeta.findUnique({
      where: { year_id: { year, id } },
      select: { slot: true, submittedAt: true, payUntil: true },
    }),
  ]);
  if (!reg || !meta) return null;
  return { status: reg.status, ...meta };
}

/** Admin: lhůta odeslané nezaplacené pozdní přihlášky +60 min (od pozdějšího z lhůty a teď). */
export async function extendLatePayment(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const year = formInt(formData, "year");
  const id = formInt(formData, "id");
  if (!year || id === null) return;
  const now = new Date();
  const late = await loadLate(year, id);
  if (!late || !late.payUntil || !lateAdminActionsAllowed(late)) {
    await backToDetail(year, id, "stale");
    return;
  }
  const next = extendedPayUntil(late.payUntil, now);
  await prisma.$transaction(async (tx) => {
    await tx.registrationMeta.update({
      where: { year_id: { year, id } },
      data: { payUntil: next },
    });
    await writeAudit(
      {
        actor: session,
        action: "entry.late_extended",
        target: entryTarget(year, id),
        detail: {
          payUntil: { from: late.payUntil!.toISOString(), to: next.toISOString() },
        },
      },
      tx,
    );
  });
  revalidateEntry();
  await backToDetail(year, id, "extended");
}

/**
 * Admin: odeslanou nezaplacenou pozdní přihlášku zrušit hned (jako auto-storno: stav 0,
 * řádky pryč, platby zůstávají → k vrácení, bez obnovení). Po lhůtě se pošle e-mail l
 * (platba nedorazila včas); před lhůtou bez e-mailu (Q381).
 */
export async function cancelLateNow(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const year = formInt(formData, "year");
  const id = formInt(formData, "id");
  if (!year || id === null) return;
  const now = new Date();
  const late = await loadLate(year, id);
  if (!late || !late.payUntil || !late.submittedAt || !lateAdminActionsAllowed(late)) {
    await backToDetail(year, id, "stale");
    return;
  }
  const afterDeadline = now.getTime() >= late.payUntil.getTime();
  const reg = await prisma.registration.findUnique({
    where: { year_id: { year, id } },
    select: {
      name: true,
      email: true,
      lines: {
        select: {
          runnerId: true,
          entryFee: true,
          runner: { select: { name: true } },
          category: { select: { name: true } },
        },
        orderBy: { runnerId: "asc" },
      },
    },
  });
  if (!reg) return;
  const paid = await paidAmount(year, id);
  const cancelled = await prisma.$transaction(async (tx) => {
    const claimed = await tx.registration.updateMany({
      where: { year, id, status: { in: [ENTRY_STATUS.empty, ENTRY_STATUS.unpaid] } },
      data: { status: ENTRY_STATUS.cancelled },
    });
    if (claimed.count !== 1) return false;
    await tx.registrationLine.deleteMany({ where: { year, registrationId: id } });
    if (afterDeadline) {
      await tx.registrationMeta.update({
        where: { year_id: { year, id } },
        data: { autoCancelledAt: now },
      });
    }
    await writeAudit(
      {
        actor: session,
        action: "entry.cancelled",
        target: entryTarget(year, id),
        detail: {
          ...cancellationDetail({
            year,
            registrationId: id,
            registrationName: reg.name,
            lines: reg.lines,
            paid,
          }),
          auto: "late_admin_now",
          afterDeadline,
        },
      },
      tx,
    );
    return true;
  });
  if (!cancelled) {
    await backToDetail(year, id, "stale");
    return;
  }
  if (afterDeadline && hasMailAddress(reg.email)) {
    const lines = reg.lines.map((line) => ({
      runner: line.runner?.name ?? "",
      fee: line.entryFee ?? 0,
    }));
    await sendLateCancelMail(reg.email, {
      year,
      id,
      lines,
      fee: lines.reduce((sum, line) => sum + line.fee, 0),
      paid,
      site: mailSite(),
      submittedAt: late.submittedAt,
      payUntil: late.payUntil,
      ...(await lateCancelOffers(now)),
    });
  }
  revalidateEntry();
  await backToDetail(year, id, "cancelled");
}
