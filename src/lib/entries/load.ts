import { paymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { recalculateRegistrationStatus } from "@/lib/entries/status";
import { buildQuickList } from "@/lib/entries/quick";
import { currentRaceYear } from "@/lib/entries/year";
import { pickActiveRegistration, pickCancelledRegistrations } from "@/lib/entries/ensure-core";

function emailMatch(value: string | null | undefined, email: string): boolean {
  return value?.trim().toLowerCase() === email.toLowerCase();
}

export async function loadMyEntry(email: string) {
  const { year, open, deadline } = await currentRaceYear();
  const yearRegs = await prisma.registration.findMany({
    where: { year },
    include: {
      lines: {
        include: {
          runner: { select: { id: true, name: true } },
          club: { select: { id: true, name: true } },
          category: { select: { name: true, entryFee: true } },
        },
        orderBy: { runnerId: "asc" },
      },
    },
  });
  // Přihláška se tu už nezakládá – vzniká až s prvním běžcem (ensureRegistration).
  let registration = pickActiveRegistration(yearRegs, email);
  const cancelled = pickCancelledRegistrations(yearRegs, email).map((row) => ({
    year: row.year,
    id: row.id,
    name: row.name,
  }));

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
  const quick = buildQuickList(
    minePast.flatMap((row) =>
      row.lines
        .filter((line) => !thisYearTaken.has(line.runnerId))
        .map((line) => ({ id: line.runnerId, name: line.runner.name })),
    ),
  );

  if (registration) {
    await recalculateRegistrationStatus(registration.year, registration.id);
    registration = await prisma.registration.findUnique({
      where: { year_id: { year: registration.year, id: registration.id } },
      include: {
        lines: {
          include: {
            runner: { select: { id: true, name: true } },
            club: { select: { id: true, name: true } },
            category: { select: { name: true, entryFee: true } },
          },
          orderBy: { runnerId: "asc" },
        },
      },
    });
  }

  const payments = registration
    ? (
        await prisma.payment.findMany({
          where: { year },
          orderBy: [{ date: "asc" }, { id: "asc" }],
        })
      ).filter((payment) => paymentRegistrationId(payment.registrationId) === registration!.id)
    : [];

  return { year, open, deadline, registration, cancelled, past: minePast, quick, payments };
}
