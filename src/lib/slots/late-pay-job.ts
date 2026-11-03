import { revalidateTag } from "next/cache";

import { paymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { cancellationDetail } from "@/lib/entries/cancel-core";
import { entryTarget } from "@/lib/entries/changes-core";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";
import { currentRaceYear } from "@/lib/entries/year";
import { HOME_COUNTS_TAG } from "@/lib/home/summary-core";
import { alertPayments } from "@/lib/payments/job";

import { slotOf } from "./core";
import {
  lastChangeOf,
  lateCancelReadiness,
  lateDraftExpired,
  lateEntryState,
  lateNeedsCancel,
} from "./late-core";
import { lateCancelOffers, mailSite, sendLateCancelMail } from "./late-mail";
import { hasMailAddress } from "./standard-pay-core";

/** Aktér auditu za plánovaný job (bez účtu). */
const SYSTEM_ACTOR = { actorUserId: null, actorEmail: "system@mcvv", actorRole: "system" } as const;

export type LatePayResult = {
  dryRun: boolean;
  /** Odeslané pozdní přihlášky zrušené po lhůtě na zaplacení. */
  cancelled: number;
  /** Rozpracované (neodeslané) pozdní přihlášky zrušené po 1 h bez změny nebo po konci termínu. */
  draftsCancelled: number;
  /** Lhůta uplynula, ale čeká se na stažení plateb zahájené po lhůtě. */
  waiting: number;
  forced: number;
};

/**
 * Auto-storno pozdních přihlášek (NAVRH 2.3/6) – volá cron připomínek, idempotentní.
 * 1. Odeslaná pozdní přihláška nezaplacená v plné výši po `platba_do`: zrušit až po úspěšném
 *    stažení plateb, které začalo po lhůtě (jinak nejvýš +5 min, pak i tak + alert).
 *    Zrušení = stav 0, řádky smazané, platby zůstávají → k vrácení v /admin/platby (bez obnovení).
 *    Pak e-mail l „přihláška zrušena, platba nedorazila včas“ (mockup dohlaska.html?s=l, Q350).
 * 2. Rozpracované (neodeslané) přihlášky se zruší po `LATE_DRAFT_TTL_MINUTES` (1 h) od poslední
 *    změny a vždy po konci pozdních přihlášek; běžci se tím uvolní (Q351). Bez e-mailu.
 */
export async function runLatePayment(options: {
  now?: Date;
  dryRun: boolean;
}): Promise<LatePayResult> {
  const now = options.now ?? new Date();
  const { dryRun } = options;
  const result: LatePayResult = { dryRun, cancelled: 0, draftsCancelled: 0, waiting: 0, forced: 0 };
  const { year, slots } = await currentRaceYear();
  const late = slotOf(slots, "late");
  if (!late) return result;

  const metas = await prisma.registrationMeta.findMany({
    where: { year, slot: "late" },
    select: { id: true, slot: true, submittedAt: true, payUntil: true, updatedAt: true },
  });
  if (metas.length === 0) return result;
  const metaById = new Map(metas.map((meta) => [meta.id, meta]));
  const [regs, payments, lastOk] = await Promise.all([
    prisma.registration.findMany({
      where: {
        year,
        id: { in: metas.map((meta) => meta.id) },
        OR: [{ status: { not: ENTRY_STATUS.cancelled } }, { status: null }],
      },
      include: {
        lines: {
          select: {
            runnerId: true,
            entryFee: true,
            created: true,
            runner: { select: { name: true } },
            category: { select: { name: true } },
          },
          orderBy: { runnerId: "asc" },
        },
      },
    }),
    prisma.payment.findMany({ where: { year }, select: { registrationId: true, amount: true } }),
    prisma.jobRun.findFirst({
      where: { job: "payments", ok: true, finishedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
  ]);
  const paidById = new Map<number, number>();
  for (const payment of payments) {
    const id = paymentRegistrationId(payment.registrationId);
    paidById.set(id, (paidById.get(id) ?? 0) + (payment.amount ?? 0));
  }
  const lateEnded = now.getTime() >= late.to.getTime();
  let forcedAny = false;
  const offers = dryRun ? null : await lateCancelOffers(now);
  const site = mailSite();

  for (const reg of regs) {
    const meta = metaById.get(reg.id);
    if (!meta) continue;
    const fee = reg.lines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0);
    const paid = paidById.get(reg.id) ?? 0;
    const state = lateEntryState({ status: reg.status, submittedAt: meta.submittedAt });
    let auto: "unpaid_late" | "late_draft";
    let forced = false;
    if (state === "draft") {
      const lastChange = lastChangeOf([
        meta.updatedAt,
        reg.created,
        ...reg.lines.map((line) => line.created),
      ]);
      if (!lateEnded && !lateDraftExpired(now, lastChange, late.to)) continue;
      auto = "late_draft";
    } else {
      if (!meta.payUntil || !lateNeedsCancel({ status: reg.status, ...meta, fee, paid })) continue;
      const readiness = lateCancelReadiness(now, meta.payUntil, lastOk?.startedAt ?? null);
      if (!readiness.ready) {
        if (now.getTime() >= meta.payUntil.getTime()) result.waiting += 1;
        continue;
      }
      forced = readiness.forced;
      auto = "unpaid_late";
    }
    if (dryRun) {
      if (auto === "late_draft") result.draftsCancelled += 1;
      else result.cancelled += 1;
      if (forced) result.forced += 1;
      continue;
    }
    const cancelled = await prisma.$transaction(async (tx) => {
      // Zabrat: jen když se stav mezitím nezměnil (platba → zaplaceno, nerušit).
      const claimed = await tx.registration.updateMany({
        where: {
          year,
          id: reg.id,
          status:
            auto === "late_draft"
              ? { in: [ENTRY_STATUS.empty, ENTRY_STATUS.unpaid] }
              : ENTRY_STATUS.unpaid,
        },
        data: { status: ENTRY_STATUS.cancelled },
      });
      if (claimed.count !== 1) return false;
      const paidNow = (
        await tx.payment.findMany({
          where: { year },
          select: { registrationId: true, amount: true },
        })
      )
        .filter((payment) => paymentRegistrationId(payment.registrationId) === reg.id)
        .reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
      await tx.registrationLine.deleteMany({ where: { year, registrationId: reg.id } });
      await tx.registrationMeta.update({
        where: { year_id: { year, id: reg.id } },
        data: { autoCancelledAt: now },
      });
      await tx.auditLog.create({
        data: {
          ...SYSTEM_ACTOR,
          action: "entry.cancelled",
          target: entryTarget(year, reg.id),
          detail: {
            ...cancellationDetail({
              year,
              registrationId: reg.id,
              registrationName: reg.name,
              lines: reg.lines,
              paid: paidNow,
            }),
            auto,
          },
        },
      });
      return true;
    });
    if (!cancelled) continue;
    if (auto === "late_draft") result.draftsCancelled += 1;
    else {
      result.cancelled += 1;
      if (offers && meta.submittedAt && meta.payUntil && hasMailAddress(reg.email)) {
        const lines = reg.lines.map((line) => ({
          runner: line.runner?.name ?? "",
          fee: line.entryFee ?? 0,
        }));
        await sendLateCancelMail(reg.email, {
          year,
          id: reg.id,
          lines,
          fee,
          paid,
          site,
          submittedAt: meta.submittedAt,
          payUntil: meta.payUntil,
          ...offers,
        });
      }
    }
    if (forced) {
      result.forced += 1;
      forcedAny = true;
    }
  }
  if (!dryRun && result.cancelled + result.draftsCancelled > 0) {
    revalidateTag(HOME_COUNTS_TAG, "max");
  }
  if (!dryRun && forcedAny) {
    await alertPayments(
      "late-autocancel-forced",
      `Nezaplacené pozdní přihlášky (${result.forced}) byly zrušeny bez úspěšného stažení plateb po lhůtě. Zkontrolujte platby na zrušené přihlášky.`,
      now,
    );
  }
  return result;
}
