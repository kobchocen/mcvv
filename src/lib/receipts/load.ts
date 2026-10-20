import { paymentRegistrationId } from "@/lib/admin/parse";
import { isStaffRole, type SessionUser } from "@/lib/auth/session";
import { getEditionStart } from "@/lib/date/race-schedule";
import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { getReceiptIssuer } from "@/lib/settings/receipt";

import { buildReceipt, canDownloadReceipt, type ReceiptDocument } from "./receipt-core";

async function loadRegistration(year: number, id: number) {
  const [registration, payments] = await Promise.all([
    prisma.registration.findUnique({
      where: { year_id: { year, id } },
      include: {
        lines: {
          include: {
            runner: { select: { name: true } },
            club: { select: { name: true } },
            category: { select: { name: true, entryFee: true } },
          },
          orderBy: { runnerId: "asc" },
        },
      },
    }),
    prisma.payment.findMany({
      where: { year },
      select: {
        id: true,
        registrationId: true,
        date: true,
        created: true,
        amount: true,
        author: true,
      },
    }),
  ]);
  return {
    registration,
    payments: payments.filter((payment) => paymentRegistrationId(payment.registrationId) === id),
  };
}

/**
 * Doklad pro přihlášeného uživatele, nebo null (neexistuje, nepatří mu, není
 * plně uhrazená…). Route handler vrací v každém takovém případě 404.
 */
export async function loadReceiptFor(
  session: SessionUser,
  year: number,
  id: number,
  now: Date = new Date(),
): Promise<ReceiptDocument | null> {
  const [{ registration, payments }, current] = await Promise.all([
    loadRegistration(year, id),
    currentRaceYear(),
  ]);
  if (
    !registration ||
    !canDownloadReceipt({
      staff: isStaffRole(session.role),
      sessionEmail: session.email,
      registrationEmail: registration.email,
      year,
      currentYear: current.year,
    })
  ) {
    return null;
  }
  return buildReceipt({
    year,
    id,
    email: registration.email,
    name: registration.name,
    status: registration.status,
    lines: registration.lines,
    payments,
    issuer: await getReceiptIssuer(),
    raceDate: getEditionStart(year),
    now,
  });
}
