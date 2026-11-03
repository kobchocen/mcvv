import { prisma } from "@/lib/db/client";

/** Konec posledního úspěšného párování plateb („Poslední kontrola banky“). */
export async function lastBankCheck(): Promise<Date | null> {
  const run = await prisma.jobRun.findFirst({
    where: { job: "payments", ok: true, finishedAt: { not: null } },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true },
  });
  return run?.finishedAt ?? null;
}
