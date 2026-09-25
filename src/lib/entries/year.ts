import { dateInputValue } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";

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
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const open = !deadline || today <= dateInputValue(deadline);
  return { year, deadline, open };
}
