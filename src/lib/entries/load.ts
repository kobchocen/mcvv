import { paymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";

function emailMatch(value: string | null | undefined, email: string): boolean {
  return value?.trim().toLowerCase() === email.toLowerCase();
}

export async function loadMyEntry(email: string, displayName: string) {
  const { year, open, deadline } = await currentRaceYear();
  const yearRegs = await prisma.registration.findMany({
    where: { year },
    include: {
      lines: {
        include: {
          runner: { select: { id: true, name: true } },
          club: { select: { name: true } },
          category: { select: { name: true, entryFee: true } },
        },
        orderBy: { runnerId: "asc" },
      },
    },
  });
  let registration = yearRegs.find((row) => emailMatch(row.email, email)) ?? null;
  if (!registration && open) {
    const nextId = (Math.max(0, ...yearRegs.map((row) => row.id)) || 0) + 1;
    registration = await prisma.registration.create({
      data: {
        year,
        id: nextId,
        email,
        name: displayName.slice(0, 128),
        type: "O",
        status: 2,
        author: email,
        created: new Date(),
      },
      include: {
        lines: {
          include: {
            runner: { select: { id: true, name: true } },
            club: { select: { name: true } },
            category: { select: { name: true, entryFee: true } },
          },
          orderBy: { runnerId: "asc" },
        },
      },
    });
  }

  const pastRegs = await prisma.registration.findMany({
    where: { year: { not: year } },
    include: {
      lines: { select: { runnerId: true, runner: { select: { id: true, name: true } } } },
    },
    orderBy: { year: "desc" },
  });
  const minePast = pastRegs.filter((row) => emailMatch(row.email, email));
  const thisYearTaken = new Set(
    (await prisma.registrationLine.findMany({ where: { year }, select: { runnerId: true } })).map(
      (row) => row.runnerId,
    ),
  );
  const quick: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const row of minePast) {
    for (const line of row.lines) {
      if (thisYearTaken.has(line.runnerId) || seen.has(line.runnerId)) {
        continue;
      }
      seen.add(line.runnerId);
      quick.push({ id: line.runnerId, name: line.runner.name });
    }
  }

  const payments = registration
    ? (
        await prisma.payment.findMany({
          where: { year },
          orderBy: [{ date: "asc" }, { id: "asc" }],
        })
      ).filter((payment) => paymentRegistrationId(payment.registrationId) === registration!.id)
    : [];

  return { year, open, deadline, registration, past: minePast, quick, payments };
}
