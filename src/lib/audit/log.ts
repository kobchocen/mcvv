import type { Prisma, PrismaClient } from "@prisma/client";

import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

/** Akce zapisované do auditu (mcvv_audit_log). */
export type AuditAction =
  | "category.records_recalculated"
  | "user.role_change"
  | "raceday.obd_export"
  | "raceday.import_presentation"
  | "raceday.import_results"
  // Den závodu: hromadné vyčištění mezičasů ročníku (Q31, Q32), detail se snímkem smazaných řádků.
  | "raceday.splits_cleared"
  // Změny přihlášek od přihlašujících (#130) – podklad pro denní souhrn pořadateli.
  | "entry.created"
  | "entry.runner_added"
  | "entry.runner_removed"
  | "entry.runner_created"
  | "entry.club_created"
  | "entry.header_changed"
  | "entry.line_club_changed"
  | "entry.cancelled"
  // Ruční sjednocení názvů klubů (#104).
  | "club.merge"
  | "club.merge_rejected"
  | "club.merge_restored"
  | "club.alias_removed"
  | "club.renamed";

/** Kdo akci provedl. Účet nemusí existovat (např. automatický job: id null). */
export type AuditActor = Pick<SessionUser, "email" | "role"> & { id: number | null };

type Db = Pick<PrismaClient, "auditLog"> | Prisma.TransactionClient;

/**
 * Zapíše auditní záznam (kdo, kdy, co, na čem, detail). V transakci předejte `tx`,
 * ať se záznam uloží právě tehdy, když se uloží i změna.
 */
export async function writeAudit(
  entry: {
    actor: AuditActor;
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
