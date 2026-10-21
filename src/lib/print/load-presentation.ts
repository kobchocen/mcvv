import { paymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { lineFee } from "@/lib/entries/fee-total";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";
import { currentRaceYear } from "@/lib/entries/year";
import { loadStartSettings } from "@/lib/race/startlist-load";
import type { StartModel } from "@/lib/race/start-time";

import type { PresentationLine, PresentationRegistration } from "./presentation-core";

export type PresentationData = {
  year: number;
  model: StartModel;
  registrations: PresentationRegistration[];
  lines: PresentationLine[];
  paidById: Map<number, number>;
};

/**
 * Podklad sestav prezentace: nezrušené přihlášky aktuálního ročníku, jejich řádky
 * (startovné po fallbacku na kategorii) a součet plateb po přihláškách.
 */
export async function loadPresentationData(): Promise<PresentationData> {
  const { year } = await currentRaceYear();
  const [settings, registrations, lines, payments] = await Promise.all([
    loadStartSettings(year),
    prisma.registration.findMany({
      where: { year, OR: [{ status: { not: ENTRY_STATUS.cancelled } }, { status: null }] },
      select: { id: true, name: true, email: true, status: true },
    }),
    prisma.registrationLine.findMany({
      where: { year },
      select: {
        registrationId: true,
        bib: true,
        runnerId: true,
        entryFee: true,
        categoryId: true,
        runner: { select: { name: true } },
        club: { select: { name: true } },
        category: { select: { name: true, entryFee: true } },
      },
    }),
    prisma.payment.findMany({ where: { year }, select: { registrationId: true, amount: true } }),
  ]);
  const paidById = new Map<number, number>();
  for (const payment of payments) {
    const id = paymentRegistrationId(payment.registrationId);
    paidById.set(id, (paidById.get(id) ?? 0) + (payment.amount ?? 0));
  }
  return {
    year,
    model: settings.model,
    registrations,
    lines: lines.map((line) => ({
      registrationId: line.registrationId,
      bib: line.bib && line.bib > 0 ? line.bib : null,
      runnerId: line.runnerId,
      name: line.runner.name,
      club: line.club.name,
      categoryId: line.categoryId,
      categoryName: line.category.name,
      fee: lineFee(line),
    })),
    paidById,
  };
}
