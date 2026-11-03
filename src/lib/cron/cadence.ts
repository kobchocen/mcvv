import { prisma } from "@/lib/db/client";
import { ENTRY_STATUS } from "@/lib/entries/status";

import { cronDecision, lateFastSince, slowDue, type CronDecision } from "./cadence-core";

export type CronRoute = "payments" | "reminders" | "mail";

const stateName = (route: CronRoute) => `cron_slow_${route}`;

/** Čeká nějaká odeslaná pozdní přihláška na platbu (nebo je těsně po lhůtě)? */
export async function latePaymentPending(now = new Date()): Promise<boolean> {
  const rows = await prisma.registrationMeta.findMany({
    where: {
      slot: "late",
      submittedAt: { not: null },
      autoCancelledAt: null,
      payUntil: { gte: lateFastSince(now) },
    },
    select: { year: true, id: true },
    take: 50,
  });
  if (rows.length === 0) return false;
  const unpaid = await prisma.registration.count({
    where: {
      status: ENTRY_STATUS.unpaid,
      OR: rows.map((row) => ({ year: row.year, id: row.id })),
    },
  });
  return unpaid > 0;
}

/**
 * Rozhodne, zda cron routa v tomto (minutovém) volání pracuje. `fastAllowed` = routa smí
 * ve spěchu běžet každou minutu. Pomalý běh se zapíše do mcvv_job_state až po rozhodnutí,
 * takže souběžná volání nanejvýš zopakují idempotentní práci.
 */
export async function cronGate(
  route: CronRoute,
  options: { now?: Date; fastAllowed: boolean },
): Promise<CronDecision> {
  const now = options.now ?? new Date();
  const last = await prisma.jobState.findUnique({ where: { name: stateName(route) } });
  const lastRun = last?.value ? new Date(last.value) : null;
  const slow = slowDue(now, lastRun && !Number.isNaN(lastRun.getTime()) ? lastRun : null);
  const pending = options.fastAllowed && !slow ? await latePaymentPending(now) : false;
  const decision = cronDecision(options.fastAllowed, pending, slow);
  if (decision.slow) {
    const value = now.toISOString();
    await prisma.jobState.upsert({
      where: { name: stateName(route) },
      create: { name: stateName(route), value },
      update: { value },
    });
  }
  return decision;
}
