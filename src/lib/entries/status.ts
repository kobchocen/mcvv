import { prisma } from "@/lib/db/client";
import { paymentRegistrationId } from "@/lib/admin/parse";
import { paidAmount } from "@/lib/entries/fee";
import { isEntryValid } from "@/lib/entries/valid";

import { ENTRY_STATUS } from "@/lib/entries/status-codes";

export { ENTRY_STATUS, type EntryStatus } from "@/lib/entries/status-codes";

export function nextStatus(
  current: number | null | undefined,
  lineCount: number,
  fee: number,
  paid: number,
): number {
  const status = current ?? ENTRY_STATUS.empty;
  if (status === ENTRY_STATUS.cancelled) {
    return ENTRY_STATUS.cancelled;
  }
  if (status === ENTRY_STATUS.confirmed) {
    if (lineCount > 0 && paid < fee) {
      return ENTRY_STATUS.unpaid;
    }
    return ENTRY_STATUS.confirmed;
  }
  if (lineCount === 0) {
    return ENTRY_STATUS.empty;
  }
  if (fee === 0) {
    return ENTRY_STATUS.paid;
  }
  if (paid < fee) {
    return ENTRY_STATUS.unpaid;
  }
  if (paid > fee) {
    return ENTRY_STATUS.overpaid;
  }
  return ENTRY_STATUS.paid;
}

export async function recalculateRegistrationStatus(year: number, id: number): Promise<void> {
  const registration = await prisma.registration.findUnique({
    where: { year_id: { year, id } },
    include: { lines: { select: { entryFee: true } } },
  });
  if (!registration) {
    return;
  }
  const fee = registration.lines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0);
  const paid = await paidAmount(year, id);
  const status = nextStatus(registration.status, registration.lines.length, fee, paid);
  if (status !== registration.status) {
    await prisma.registration.update({
      where: { year_id: { year, id } },
      data: { status },
    });
  }
}

/**
 * Registration ids of the given race year that count as registered (see isEntryValid).
 * Payment coverage is evaluated per application from the payments table, so a stale
 * stored status does not hide fully paid or 0 Kč applications.
 */
export async function validRegistrationIds(year: number): Promise<Set<number>> {
  const [registrations, payments] = await Promise.all([
    prisma.registration.findMany({
      where: { year },
      select: {
        id: true,
        status: true,
        lines: { select: { entryFee: true, category: { select: { entryFee: true } } } },
      },
    }),
    prisma.payment.findMany({ where: { year }, select: { registrationId: true, amount: true } }),
  ]);
  const paidById = new Map<number, number>();
  for (const payment of payments) {
    const id = paymentRegistrationId(payment.registrationId);
    paidById.set(id, (paidById.get(id) ?? 0) + (payment.amount ?? 0));
  }
  const valid = new Set<number>();
  for (const registration of registrations) {
    const fee = registration.lines.reduce(
      (sum, line) => sum + (line.entryFee ?? line.category.entryFee ?? 0),
      0,
    );
    if (
      isEntryValid({
        status: registration.status,
        lineCount: registration.lines.length,
        fee,
        paid: paidById.get(registration.id) ?? 0,
      })
    ) {
      valid.add(registration.id);
    }
  }
  return valid;
}

/** Number of runners on valid applications of the given race year. */
export async function countValidRunners(year: number): Promise<number> {
  const ids = await validRegistrationIds(year);
  if (ids.size === 0) {
    return 0;
  }
  return prisma.registrationLine.count({ where: { year, registrationId: { in: [...ids] } } });
}
