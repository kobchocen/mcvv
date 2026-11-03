import { paymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";
import { currentRaceYear } from "@/lib/entries/year";
import { env } from "@/lib/env";
import { enqueueMail } from "@/lib/mail/queue";

import { runLatePayment, type LatePayResult } from "@/lib/slots/late-pay-job";
import { runStandardPayment, type StandardPayResult } from "@/lib/slots/standard-pay-job";

import { renderReminder } from "./render";
import { dueReminder } from "./schedule";

/** Mimo APP_ENV=prod se připomínky jen spočítají (STG má kopii skutečných e-mailů). */
export function remindersDryRun(): boolean {
  if (env.REMINDERS_DRY_RUN) return env.REMINDERS_DRY_RUN === "true";
  const appEnv = (env.APP_ENV ?? "").toLowerCase();
  return !(appEnv === "prod" || appEnv === "production");
}

export type RemindersResult = {
  dryRun: boolean;
  reminder1: number;
  /** Doplatek standardu (e-mail v den lhůty, automatické zrušení po lhůtě). */
  standardPay: StandardPayResult;
  /** Pozdní přihlášky: auto-storno po lhůtě na zaplacení, košíky po konci termínu. */
  latePay: LatePayResult;
};

/**
 * Zařadí due připomínky R1 do e-mailové fronty (nízká priorita), spustí doplatek standardu
 * a auto-storno pozdních přihlášek.
 * Idempotentní.
 */
export async function runReminders(
  options: { now?: Date; dryRun?: boolean } = {},
): Promise<RemindersResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? remindersDryRun();
  const { year, startModel, standardEnd } = await currentRaceYear();
  const site = (env.AUTH_ORIGIN ?? "https://www.mcvv.org").replace(/\/$/, "");
  const [regs, payments, metas] = await Promise.all([
    prisma.registration.findMany({
      where: { year, status: ENTRY_STATUS.unpaid },
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
    }),
    prisma.payment.findMany({ where: { year }, select: { registrationId: true, amount: true } }),
    prisma.registrationMeta.findMany({ where: { year } }),
  ]);
  const paidById = new Map<number, number>();
  for (const p of payments) {
    const id = paymentRegistrationId(p.registrationId);
    paidById.set(id, (paidById.get(id) ?? 0) + (p.amount ?? 0));
  }
  const metaById = new Map(metas.map((m) => [m.id, m]));
  let reminder1 = 0;

  for (const reg of regs) {
    const meta = metaById.get(reg.id);
    const fee = reg.lines.reduce((sum, l) => sum + (l.entryFee ?? 0), 0);
    const paid = paidById.get(reg.id) ?? 0;
    const lineTimes = reg.lines.map((l) => l.created?.getTime() ?? 0);
    const lastModifiedMs = Math.max(
      meta?.updatedAt?.getTime() ?? 0,
      reg.created?.getTime() ?? 0,
      ...lineTimes,
    );
    const kind = dueReminder(
      {
        status: reg.status,
        email: reg.email,
        fee,
        paid,
        lastModified: lastModifiedMs ? new Date(lastModifiedMs) : null,
        reminder1At: meta?.reminder1At ?? null,
      },
      { now, standardEnd },
    );
    if (!kind) continue;
    if (dryRun) {
      reminder1 += 1;
      continue;
    }
    // Atomicky „zabrat“ připomínku – souběžný běh ji nepošle podruhé.
    await prisma.registrationMeta.createMany({
      data: [{ year, id: reg.id }],
      skipDuplicates: true,
    });
    const claimed = await prisma.registrationMeta.updateMany({
      where: { year, id: reg.id, reminder1At: null },
      data: { reminder1At: now },
    });
    if (claimed.count !== 1) continue;
    const mail = renderReminder({
      year,
      id: reg.id,
      name: reg.name,
      lines: reg.lines.map((l) => ({
        runner: l.runner.name,
        club: l.club.name,
        category: l.category.name,
        fee: l.entryFee ?? 0,
      })),
      fee,
      paid,
      site,
      startZeroSeconds: startModel.zeroSeconds,
    });
    await enqueueMail({
      ...mail,
      to: reg.email!,
      kind: "reminder",
      dedupeKey: `reminder1:${year}:${reg.id}`,
    });
    reminder1 += 1;
  }
  const standardPay = await runStandardPayment({ now, dryRun });
  const latePay = await runLatePayment({ now, dryRun });
  return { dryRun, reminder1, standardPay, latePay };
}
