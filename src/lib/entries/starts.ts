import { prisma } from "@/lib/db/client";

export async function countPastStarts(
  runnerIds: string[],
  currentYear: number,
): Promise<Map<string, number>> {
  if (runnerIds.length === 0) {
    return new Map();
  }
  const rows = await prisma.result.groupBy({
    by: ["runnerId"],
    where: { runnerId: { in: runnerIds }, year: { not: currentYear } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.runnerId, row._count._all]));
}

/** Runner ids that were entered (prihlaska_radek) in any year before `currentYear`. */
export async function enteredBefore(
  runnerIds: string[],
  currentYear: number,
): Promise<Set<string>> {
  if (runnerIds.length === 0) {
    return new Set();
  }
  const rows = await prisma.registrationLine.findMany({
    where: { runnerId: { in: runnerIds }, year: { lt: currentYear } },
    select: { runnerId: true },
    distinct: ["runnerId"],
  });
  return new Set(rows.map((row) => row.runnerId));
}

export async function bestRaceTimes(runnerIds: string[]): Promise<Map<string, number>> {
  if (runnerIds.length === 0) {
    return new Map();
  }
  const rows = await prisma.result.groupBy({
    by: ["runnerId"],
    where: { runnerId: { in: runnerIds } },
    _min: { time: true },
  });
  const times = new Map<string, number>();
  for (const row of rows) {
    if (row._min.time != null) {
      times.set(row.runnerId, row._min.time);
    }
  }
  return times;
}
