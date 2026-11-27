import { writeAudit } from "@/lib/audit/log";
import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

import { hasSplitmakerRole } from "./assignment-core";

/** Uložené přiřazení účtu (řetězec kódů) nebo null. */
export async function getAssignedStations(userId: number): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { splitStations: true },
  });
  return row?.splitStations ?? null;
}

/**
 * Účty s rolí Mezičasy (hlavní sloupec nebo grant v `mcvv_user_role`) a jejich stanoviště.
 * Platí i při vypnutém `permissions.v2`.
 */
export async function listSplitmakers() {
  return prisma.user.findMany({
    where: {
      OR: [{ role: "splitmaker" }, { roleGrants: { some: { role: "splitmaker" } } }],
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, email: true, splitStations: true },
  });
}

/**
 * Uloží přiřazení stanovišť splitmakerovi (účty s rolí Mezičasy v sloupci nebo v grantech).
 * Platí hned – server ho čte při každé dávce zápisů. Audit `user.split_stations_change`.
 */
export async function saveAssignment(
  actor: SessionUser,
  userId: number,
  value: string | null,
): Promise<"ok" | "not_found" | "unchanged"> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        splitStations: true,
        roleGrants: { select: { role: true } },
      },
    });
    if (
      !target ||
      !hasSplitmakerRole(
        target.role,
        target.roleGrants.map((row) => row.role),
      )
    ) {
      return "not_found";
    }
    if ((target.splitStations ?? null) === value) return "unchanged";
    await tx.user.update({ where: { id: userId }, data: { splitStations: value } });
    await writeAudit(
      {
        actor,
        action: "user.split_stations_change",
        target: `user:${userId}`,
        detail: { email: target.email, from: target.splitStations ?? null, to: value },
      },
      tx,
    );
    return "ok";
  });
}
