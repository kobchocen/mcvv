import { paymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";
import { currentRaceYear, registrationDeadlineEnd } from "@/lib/entries/year";
import { env } from "@/lib/env";
import { enqueueMail } from "@/lib/mail/queue";

import { renderReminder } from "./render";
import { dueReminder } from "./schedule";

/** Mimo APP_ENV=prod se připomínky jen spočítají (STG má kopii skutečných e-mailů). */
export function remindersDryRun(): boolean {
  if (env.REMINDERS_DRY_RUN) return env.REMINDERS_DRY_RUN === "true";
  const appEnv = (env.APP_ENV ?? "").toLowerCase();
  return !(appEnv === "prod" || appEnv === "production");
}

export type RemindersResult = { dryRun: boolean; reminder1: number; reminder2: number };

/** Zařadí due připomínky do e-mailové fronty (nízká priorita). Idempotentní. */
export async function runReminders(
  options: { now?: Date; dryRun?: boolean } = {},
): Promise<RemindersResult> {
  const now = options.now ?? new Date();
  const dryRun = options.dryRun ?? remindersDryRun();
  const { year, deadline } = await currentRaceYear();
  const deadlineEnd = registrationDeadlineEnd(deadline);
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
  const result: RemindersResult = { dryRun, reminder1: 0, reminder2: 0 };

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
        reminder2At: meta?.reminder2At ?? null,
      },
      { now, year, deadlineEnd },
    );
    if (!kind) continue;
    if (dryRun) {
      result[kind === 1 ? "reminder1" : "reminder2"] += 1;
      continue;
    }
    // Atomicky „zabrat“ připomínku – souběžný běh ji nepošle podruhé.
    await prisma.registrationMeta.createMany({
      data: [{ year, id: reg.id }],
      skipDuplicates: true,
    });
    const field = kind === 1 ? "reminder1At" : "reminder2At";
    const claimed = await prisma.registrationMeta.updateMany({
      where: { year, id: reg.id, [field]: null },
      data: { [field]: now },
    });
    if (claimed.count !== 1) continue;
    const mail = renderReminder({
      kind,
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
      deadline: deadline ? deadline.toISOString().slice(0, 10) : null,
    });
    await enqueueMail({
      ...mail,
      to: reg.email!,
      kind: "reminder",
      dedupeKey: `reminder${kind}:${year}:${reg.id}`,
    });
    result[kind === 1 ? "reminder1" : "reminder2"] += 1;
  }
  return result;
}
