import { paymentRegistrationId, toPaymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";

export type CancelledEntryRefund = {
  year: number;
  registrationId: number;
  email: string | null;
  autoCancelledAt: Date;
  paid: number;
};

/**
 * Automaticky zrušené přihlášky, na které už přišly (částečné) platby a ještě nebyly vráceny.
 * Zrušená přihláška se nikdy neobnovuje – peníze se vrací plátci.
 */
export async function loadCancelledEntryRefunds(): Promise<CancelledEntryRefund[]> {
  const metas = await prisma.registrationMeta.findMany({
    where: { autoCancelledAt: { not: null }, refundedAt: null },
    select: { year: true, id: true, autoCancelledAt: true },
  });
  if (metas.length === 0) return [];
  const years = [...new Set(metas.map((m) => m.year))];
  const [payments, regs] = await Promise.all([
    prisma.payment.findMany({
      where: {
        year: { in: years },
        registrationId: { in: [...new Set(metas.map((m) => toPaymentRegistrationId(m.id)))] },
      },
      select: { year: true, registrationId: true, amount: true },
    }),
    prisma.registration.findMany({
      where: { OR: metas.map((m) => ({ year: m.year, id: m.id })) },
      select: { year: true, id: true, email: true },
    }),
  ]);
  return metas
    .map((m) => ({
      year: m.year,
      registrationId: m.id,
      email: regs.find((r) => r.year === m.year && r.id === m.id)?.email ?? null,
      autoCancelledAt: m.autoCancelledAt!,
      paid: payments
        .filter((p) => p.year === m.year && paymentRegistrationId(p.registrationId) === m.id)
        .reduce((sum, p) => sum + (p.amount ?? 0), 0),
    }))
    .filter((r) => r.paid > 0)
    .sort((a, b) => b.autoCancelledAt.getTime() - a.autoCancelledAt.getTime());
}
