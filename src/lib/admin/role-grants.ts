import type { Prisma } from "@prisma/client";

import type { UserRole } from "@/lib/auth/roles";
import { grantsFromLegacyRole } from "@/lib/auth/staff-roles";

/**
 * Drží `mcvv_user_role` v souladu se starým sloupcem `mcvv_user.role` při změně role
 * v administraci (P3, dokud se role nespravují přímo jako víc rolí v P5): odebere role
 * odvozené ze staré hodnoty a přidá role nové hodnoty. Ostatní role účtu nechá být.
 * Volá se ve stejné transakci jako změna `mcvv_user.role`.
 */
export async function syncLegacyRoleGrants(
  tx: Prisma.TransactionClient,
  input: { userId: number; from: UserRole; to: UserRole; actorId: number | null },
): Promise<void> {
  const remove = grantsFromLegacyRole(input.from);
  const add = grantsFromLegacyRole(input.to);
  const stale = remove.filter((role) => !add.includes(role));
  if (stale.length) {
    await tx.userRoleGrant.deleteMany({ where: { userId: input.userId, role: { in: stale } } });
  }
  if (add.length) {
    await tx.userRoleGrant.createMany({
      data: add.map((role) => ({ userId: input.userId, role, createdBy: input.actorId })),
      skipDuplicates: true,
    });
  }
}
