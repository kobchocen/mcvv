import type { Prisma, PrismaClient } from "@prisma/client";

import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

/** Akce zapisované do auditu (mcvv_audit_log). */
export type AuditAction =
  | "category.records_recalculated"
  | "user.role_change"
  | "raceday.obd_export"
  | "raceday.import_presentation"
  | "raceday.import_results";

type Db = Pick<PrismaClient, "auditLog"> | Prisma.TransactionClient;

/**
 * Zapíše auditní záznam (kdo, kdy, co, na čem, detail). V transakci předejte `tx`,
 * ať se záznam uloží právě tehdy, když se uloží i změna.
 */
export async function writeAudit(
  entry: {
    actor: SessionUser;
    action: AuditAction;
    target?: string;
    detail?: Prisma.InputJsonValue;
  },
  db: Db = prisma,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorUserId: entry.actor.id,
      actorEmail: entry.actor.email,
      actorRole: entry.actor.role,
      action: entry.action,
      target: entry.target ?? null,
      detail: entry.detail,
    },
  });
}
