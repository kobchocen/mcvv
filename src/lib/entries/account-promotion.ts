import { prisma } from "@/lib/db/client";
import { effectivePromotionOptOut, type PromotionRecord } from "@/lib/newsletter/core";

/** Přihlášky e-mailu ve tvaru pro rozhodnutí o souhlasu (včetně počtu běžců). */
export async function promotionRecordsFor(email: string): Promise<PromotionRecord[]> {
  const rows = await prisma.registration.findMany({
    where: { email: { equals: email } },
    select: {
      email: true,
      promotion: true,
      year: true,
      created: true,
      id: true,
      _count: { select: { lines: true } },
    },
  });
  return rows.map(({ _count, ...row }) => ({ ...row, lineCount: _count.lines }));
}

/**
 * Nechce účet informační e-maily? Rozhoduje souhlas na účtu (`mcvv_user.promotion_optout`);
 * dokud ho účet nemá (null), platí poslední přihláška se stejným e-mailem.
 */
export async function loadAccountPromotionOptOut(email: string): Promise<boolean> {
  const [account, records] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { promotionOptOut: true } }),
    promotionRecordsFor(email),
  ]);
  return effectivePromotionOptOut(
    { email, promotionOptOut: account?.promotionOptOut ?? null },
    records,
  );
}

/** Uloží souhlas na účet daného e-mailu (pokud účet existuje). */
export async function setAccountPromotionOptOut(email: string, optOut: boolean): Promise<void> {
  await prisma.user.updateMany({
    where: { email: email.trim().toLowerCase() },
    data: { promotionOptOut: optOut },
  });
}
