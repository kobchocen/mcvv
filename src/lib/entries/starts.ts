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
