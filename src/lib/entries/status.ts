import { prisma } from "@/lib/db/client";
import { paidAmount } from "@/lib/entries/fee";

export const ENTRY_STATUS = {
  cancelled: 0,
  empty: 1,
  unpaid: 2,
  paid: 3,
  overpaid: 4,
  confirmed: 5,
} as const;

export type EntryStatus = (typeof ENTRY_STATUS)[keyof typeof ENTRY_STATUS];

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

export async function countConfirmedRunners(year: number): Promise<number> {
  return prisma.registrationLine.count({
    where: { year, registration: { status: ENTRY_STATUS.confirmed } },
  });
}
