import { paymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { enqueueMail } from "@/lib/mail/queue";
import { getOrganizerEmail } from "@/lib/settings/messages";

import {
  FREE_AUTO_CONFIRM_ACTION,
  freeConfirmDedupeKey,
  isFreeAutoConfirmDue,
  lastModifiedOf,
} from "./auto-confirm-core";
import { renderEntryConfirmation } from "./confirm-mail-render";
import { ENTRY_STATUS } from "./status-codes";
import { currentRaceYear } from "./year";

export * from "./auto-confirm-core";

/** Aktér auditu za plánovaný job (bez účtu). */
const SYSTEM_ACTOR = { actorUserId: null, actorEmail: "system@mcvv", actorRole: "system" } as const;

/** Mimo produkci jde potvrzení na pořadatelský e-mail (STG má kopii skutečných adres). */
export function freeConfirmRedirected(): boolean {
  const appEnv = (env.APP_ENV ?? "").toLowerCase();
  return !(appEnv === "prod" || appEnv === "production");
}

export type FreeAutoConfirmResult = { candidates: number; confirmed: number; mailed: number };

/**
 * Potvrdí přihlášky letošního ročníku se startovným 0 Kč, které se aspoň
 * `FREE_AUTO_CONFIRM_QUIET_MS` nezměnily. Volá cron e-mailové fronty (každých 15 min).
 * Podmíněný update (stav 3 → 5) brání dvojímu potvrzení při souběhu, klíč e-mailu
 * dvojímu odeslání.
 */
export async function runFreeAutoConfirm(now = new Date()): Promise<FreeAutoConfirmResult> {
  const { year } = await currentRaceYear();
  const regs = await prisma.registration.findMany({
    where: { year, status: ENTRY_STATUS.paid },
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
  const result: FreeAutoConfirmResult = { candidates: 0, confirmed: 0, mailed: 0 };
  if (regs.length === 0) return result;
  const [payments, metas] = await Promise.all([
    prisma.payment.findMany({ where: { year }, select: { registrationId: true, amount: true } }),
    prisma.registrationMeta.findMany({ where: { year, id: { in: regs.map((reg) => reg.id) } } }),
  ]);
  const paidById = new Map<number, number>();
  for (const payment of payments) {
    const id = paymentRegistrationId(payment.registrationId);
    paidById.set(id, (paidById.get(id) ?? 0) + (payment.amount ?? 0));
  }
  const metaById = new Map(metas.map((meta) => [meta.id, meta]));
  const site = (env.AUTH_ORIGIN ?? "https://www.mcvv.org").replace(/\/$/, "");
  const redirected = freeConfirmRedirected();

  for (const reg of regs) {
    const fee = reg.lines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0);
    const due = isFreeAutoConfirmDue(
      {
        status: reg.status,
        lineCount: reg.lines.length,
        fee,
        paid: paidById.get(reg.id) ?? 0,
        email: reg.email,
        lastModified: lastModifiedOf([
          metaById.get(reg.id)?.updatedAt,
          reg.created,
          ...reg.lines.map((line) => line.created),
        ]),
      },
      now,
    );
    if (!due) continue;
    result.candidates += 1;
    const runnerIds = reg.lines.map((line) => line.runnerId);
    const confirmed = await prisma.$transaction(async (tx) => {
      const updated = await tx.registration.updateMany({
        where: { year, id: reg.id, status: ENTRY_STATUS.paid },
        data: { status: ENTRY_STATUS.confirmed },
      });
      if (updated.count !== 1) return false;
      await tx.auditLog.create({
        data: {
          ...SYSTEM_ACTOR,
          action: FREE_AUTO_CONFIRM_ACTION,
          target: `registration:${year}/${reg.id}`,
          detail: { year, registrationId: reg.id, runnerIds, fee: 0 },
        },
      });
      return true;
    });
    if (!confirmed) continue;
    result.confirmed += 1;
    const to = reg.email!.trim().toLowerCase();
    const mail = renderEntryConfirmation({
      year,
      id: reg.id,
      email: to,
      name: reg.name,
      lines: reg.lines.map((line) => ({
        runner: line.runner.name,
        club: line.club.name,
        category: line.category.name,
        fee: line.entryFee ?? 0,
      })),
      fee: 0,
      paid: 0,
      site,
    });
    const { created } = await enqueueMail({
      ...mail,
      subject: redirected
        ? `[TEST – pro ${to.replace(/@.*/, "@…")}] ${mail.subject}`
        : mail.subject,
      to: redirected ? await getOrganizerEmail() : to,
      kind: "confirmation",
      dedupeKey: freeConfirmDedupeKey(year, reg.id, runnerIds),
    });
    if (created) result.mailed += 1;
  }
  return result;
}

/** Přihlášky ročníku, které potvrdil job (pro odznak v administraci). */
export async function freeAutoConfirmedIds(year: number): Promise<Set<number>> {
  const rows = await prisma.auditLog.findMany({
    where: { action: FREE_AUTO_CONFIRM_ACTION, target: { startsWith: `registration:${year}/` } },
    select: { target: true },
  });
  return new Set(
    rows
      .map((row) => Number.parseInt((row.target ?? "").split("/")[1] ?? "", 10))
      .filter((id) => Number.isFinite(id)),
  );
}
