import type { Prisma } from "@prisma/client";

/** Jen tabulka skrytých běžců rychlé nabídky (MD-31) – v transakci sloučení / změny id. */
type HiddenDb = Pick<Prisma.TransactionClient, "userQuickHidden">;

/**
 * Id běžce se změnilo (sloučení #261, změna pohlaví #103): skrytí se přesunou na nové id,
 * ať se sloučený běžec zase nenabízí. Kdo měl skryté obě id, má jeden řádek.
 */
export async function moveQuickHidden(db: HiddenDb, fromId: string, toId: string) {
  const rows = await db.userQuickHidden.findMany({
    where: { runnerId: fromId },
    select: { userId: true, createdAt: true },
  });
  if (rows.length === 0) return 0;
  await db.userQuickHidden.createMany({
    data: rows.map((row) => ({ userId: row.userId, runnerId: toId, createdAt: row.createdAt })),
    skipDuplicates: true,
  });
  await db.userQuickHidden.deleteMany({ where: { runnerId: fromId } });
  return rows.length;
}
