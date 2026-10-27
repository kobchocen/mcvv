import { prisma } from "@/lib/db/client";
import { paymentRegistrationId } from "@/lib/admin/parse";
import { getFreeEntryEmails } from "@/lib/entries/settings";
import {
  absoluteWinnerIdsFrom,
  feeReasonFor,
  veteranIdsFrom,
  type FeeReason,
} from "@/lib/entries/fee-core";

export type { FeeReason } from "@/lib/entries/fee-core";

export type LineFee = { fee: number; reason: FeeReason | null };

/**
 * Výpočet startovného pro víc řádků najednou (#189): seznam e-mailů pořadatelů i tabulka
 * výsledků se načtou nejvýš jednou (výsledky jen, když e-mail není pořadatelský), ne
 * 1× / 2× pro každý řádek.
 */
export function createLineFeeResolver(): (
  email: string,
  runnerId: string,
  categoryFee: number,
) => Promise<LineFee> {
  let freeEmails: Promise<Set<string>> | undefined;
  let results: Promise<{ winners: Set<string>; veterans: Set<string> }> | undefined;
  const loadResults = async () => {
    const rows = await prisma.result.findMany({
      select: { year: true, runnerId: true, time: true },
    });
    return { winners: absoluteWinnerIdsFrom(rows), veterans: veteranIdsFrom(rows) };
  };
  return async (email, runnerId, categoryFee) => {
    freeEmails ??= getFreeEntryEmails();
    const free = await freeEmails;
    if (feeReasonFor(email, runnerId, { freeEmails: free, winners: EMPTY, veterans: EMPTY })) {
      return { fee: 0, reason: "organizer" };
    }
    results ??= loadResults();
    const reason = feeReasonFor(email, runnerId, { freeEmails: free, ...(await results) });
    return reason ? { fee: 0, reason } : { fee: categoryFee, reason: null };
  };
}

const EMPTY: ReadonlySet<string> = new Set();

export async function computeLineFee(
  email: string,
  runnerId: string,
  categoryFee: number,
): Promise<LineFee> {
  return createLineFeeResolver()(email, runnerId, categoryFee);
}

export async function paidAmount(year: number, registrationId: number): Promise<number> {
  const payments = await prisma.payment.findMany({
    where: { year },
    select: { registrationId: true, amount: true },
  });
  return payments
    .filter((payment) => paymentRegistrationId(payment.registrationId) === registrationId)
    .reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
}
