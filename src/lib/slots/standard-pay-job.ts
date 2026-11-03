import { revalidateTag } from "next/cache";

import { paymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { freeConfirmRedirected } from "@/lib/entries/auto-confirm";
import { cancellationDetail } from "@/lib/entries/cancel-core";
import { entryTarget } from "@/lib/entries/changes-core";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";
import { currentRaceYear } from "@/lib/entries/year";
import { env } from "@/lib/env";
import { HOME_COUNTS_TAG } from "@/lib/home/summary-core";
import { enqueueMail } from "@/lib/mail/queue";
import { alertPayments } from "@/lib/payments/job";
import { getOrganizerEmail } from "@/lib/settings/messages";

import { slotOf, standardPayMailAt } from "./core";
import { onsiteWindow } from "./defaults";
import {
  autoCancelMailDedupeKey,
  cancelReadiness,
  hasMailAddress,
  needsStandardPayment,
  standardPayMailDedupeKey,
  standardPayPhase,
  type StandardPayPhase,
} from "./standard-pay-core";
import {
  renderAutoCancelMail,
  renderStandardPayMail,
  type StandardPayMailInput,
} from "./standard-pay-render";

/** Aktér auditu za plánovaný job (bez účtu). */
const SYSTEM_ACTOR = { actorUserId: null, actorEmail: "system@mcvv", actorRole: "system" } as const;

export type StandardPayResult = {
  dryRun: boolean;
  phase: StandardPayPhase | "off";
  mailed: number;
  cancelled: number;
  /** Lhůta uplynula, ale čeká se na stažení plateb zahájené po lhůtě. */
  waiting: boolean;
  forced: boolean;
};

/**
 * Doplatek standardních přihlášek – volá cron připomínek (každých 15 min), idempotentní.
 * 1. Od `doplatek_std_mail` v den lhůty do lhůty: jednou e-mail „zaplaťte dnes do …“
 *    nezaplaceným placeným standardním přihláškám (claim `doplatek_mail_at`).
 * 2. Po lhůtě (`doplatek_std_do`) a stažení plateb: automatické zrušení (stav 0, řádky
 *    smazané, platby zůstávají → k vrácení), audit `entry.cancelled` (system), e-mail.
 * Mimo produkci se e-maily posílají na pořadatelský e-mail; `dryRun` jen počítá.
 */
export async function runStandardPayment(options: {
  now?: Date;
  dryRun: boolean;
}): Promise<StandardPayResult> {
  const now = options.now ?? new Date();
  const { dryRun } = options;
  const result: StandardPayResult = {
    dryRun,
    phase: "off",
    mailed: 0,
    cancelled: 0,
    waiting: false,
    forced: false,
  };
  const race = await currentRaceYear();
  const { year, slots, standardEnd, standardPayUntil: payUntil, slotSettings } = race;
  const onsite = slotOf(slots, "onsite");
  // Jen ročníky s termíny; po dni závodu už nic (ochrana proti opožděnému nasazení).
  if (slots.length === 0 || !standardEnd || !payUntil || !race.raceDate) return result;
  if (now.getTime() < standardEnd.getTime()) return { ...result, phase: "before" };
  if (onsite && now.getTime() >= onsite.to.getTime()) return result;

  const mailAt = standardPayMailAt(payUntil, slotSettings.standardPayMailS);
  const phase = standardPayPhase(now, { mailAt, payUntil });
  result.phase = phase;
  if (phase === "before") return result;

  let forced = false;
  if (phase === "cancel") {
    const lastOk = await prisma.jobRun.findFirst({
      where: { job: "payments", ok: true, finishedAt: { not: null }, startedAt: { gte: payUntil } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    const readiness = cancelReadiness(now, payUntil, lastOk?.startedAt ?? null);
    if (!readiness.ready) return { ...result, waiting: true };
    forced = readiness.forced;
    result.forced = forced;
  }

  const [regs, payments, metas] = await Promise.all([
    prisma.registration.findMany({
      where: { year, status: ENTRY_STATUS.unpaid },
      include: {
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
    }),
    prisma.payment.findMany({ where: { year }, select: { registrationId: true, amount: true } }),
    prisma.registrationMeta.findMany({ where: { year } }),
  ]);
  const paidById = new Map<number, number>();
  for (const payment of payments) {
    const id = paymentRegistrationId(payment.registrationId);
    paidById.set(id, (paidById.get(id) ?? 0) + (payment.amount ?? 0));
  }
  const metaById = new Map(metas.map((meta) => [meta.id, meta]));
  const site = (env.AUTH_ORIGIN ?? "https://www.mcvv.org").replace(/\/$/, "");
  const redirected = freeConfirmRedirected();
  const organizerEmail = redirected ? await getOrganizerEmail() : null;
  const late = slotOf(slots, "late");
  // Okno závodní kanceláře: ze slotu na místě, jinak z nastavení ročníku (kancelar_od / na_miste_do).
  const onsiteHours =
    onsite ?? onsiteWindow(race.raceDate, slotSettings.officeOpensS, slotSettings.onsiteUntilS);
  const onsiteInfo = {
    raceDate: onsiteHours.from,
    from: onsiteHours.from,
    to: onsiteHours.to,
    feeAdult: onsite?.feeAdult ?? 200,
    feeYouth: onsite?.feeYouth ?? 100,
  };
  const lateInfo =
    late?.active && late.to.getTime() > now.getTime()
      ? { to: late.to, feeAdult: late.feeAdult, feeYouth: late.feeYouth }
      : null;

  const recipient = (email: string) => organizerEmail ?? email.trim().toLowerCase();
  const subjectFor = (email: string, subject: string) =>
    redirected
      ? `[TEST – pro ${email.trim().toLowerCase().replace(/@.*/, "@…")}] ${subject}`
      : subject;

  for (const reg of regs) {
    const meta = metaById.get(reg.id);
    const fee = reg.lines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0);
    const paid = paidById.get(reg.id) ?? 0;
    if (
      !needsStandardPayment({
        status: reg.status,
        email: reg.email,
        fee,
        paid,
        slot: meta?.slot ?? null,
      })
    )
      continue;
    const mailInput: StandardPayMailInput = {
      year,
      id: reg.id,
      lines: reg.lines.map((line) => ({
        runner: line.runner?.name ?? "",
        fee: line.entryFee ?? 0,
      })),
      fee,
      paid,
      site,
      standardEnd,
      payUntil,
      late: lateInfo,
      onsite: onsiteInfo,
    };

    if (phase === "mail") {
      if (meta?.standardPayMailAt || !hasMailAddress(reg.email)) continue;
      if (dryRun) {
        result.mailed += 1;
        continue;
      }
      await prisma.registrationMeta.createMany({
        data: [{ year, id: reg.id }],
        skipDuplicates: true,
      });
      const claimed = await prisma.registrationMeta.updateMany({
        where: { year, id: reg.id, standardPayMailAt: null },
        data: { standardPayMailAt: now },
      });
      if (claimed.count !== 1) continue;
      const mail = renderStandardPayMail(mailInput);
      await enqueueMail({
        ...mail,
        subject: subjectFor(reg.email, mail.subject),
        to: recipient(reg.email),
        kind: "confirmation",
        dedupeKey: standardPayMailDedupeKey(year, reg.id),
      });
      result.mailed += 1;
      continue;
    }

    // phase === "cancel"
    if (dryRun) {
      result.cancelled += 1;
      continue;
    }
    const cancelled = await prisma.$transaction(async (tx) => {
      // Zabrat: jen když je přihláška pořád nezaplacená (platba mezitím → stav 3, nerušit).
      const claimed = await tx.registration.updateMany({
        where: { year, id: reg.id, status: ENTRY_STATUS.unpaid },
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
      await tx.registrationMeta.upsert({
        where: { year_id: { year, id: reg.id } },
        create: { year, id: reg.id, autoCancelledAt: now },
        update: { autoCancelledAt: now },
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
            auto: "unpaid_standard",
          },
        },
      });
      return true;
    });
    if (!cancelled) continue;
    result.cancelled += 1;
    if (hasMailAddress(reg.email)) {
      const mail = renderAutoCancelMail(mailInput);
      await enqueueMail({
        ...mail,
        subject: subjectFor(reg.email, mail.subject),
        to: recipient(reg.email),
        kind: "confirmation",
        dedupeKey: autoCancelMailDedupeKey(year, reg.id),
      });
    }
  }
  if (result.cancelled > 0 && !dryRun) {
    revalidateTag(HOME_COUNTS_TAG, "max");
    if (forced) {
      await alertPayments(
        "autocancel-forced",
        `Nezaplacené standardní přihlášky (${result.cancelled}) byly zrušeny bez úspěšného stažení plateb po lhůtě. Zkontrolujte platby na zrušené přihlášky.`,
        now,
      );
    }
  }
  return result;
}
