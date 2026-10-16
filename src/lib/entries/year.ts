import { zonedCivilToUtc } from "@/lib/date/race-schedule";
import { prisma } from "@/lib/db/client";

export function registrationDeadlineEnd(deadline: Date | null | undefined): Date | null {
  if (!deadline) {
    return null;
  }
  return zonedCivilToUtc(
    deadline.getUTCFullYear(),
    deadline.getUTCMonth() + 1,
    deadline.getUTCDate(),
    23,
    59,
    59,
  );
}

export async function currentRaceYear(): Promise<{
  year: number;
  deadline: Date | null;
  open: boolean;
}> {
  const latest = await prisma.edition.findFirst({
    orderBy: { id: "desc" },
    select: { date: true, id: true, regDeadline: true },
  });
  const year = latest?.date.getUTCFullYear() ?? latest?.id ?? new Date().getFullYear();
  const deadline = latest?.regDeadline ?? null;
  const end = registrationDeadlineEnd(deadline);
  const open = !end || Date.now() <= end.getTime();
  return { year, deadline, open };
}
