import type { Prisma, PrismaClient } from "@prisma/client";

import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";

/** Akce zapisované do auditu (mcvv_audit_log). */
export type AuditAction =
  | "category.records_recalculated"
  | "user.role_change"
  // Přiřazení splitmakera ke stanovišti (mcvv_user.split_stations).
  | "user.split_stations_change"
  | "raceday.obd_export"
  | "raceday.import_presentation"
  | "raceday.import_results"
  // Den závodu: hromadné vyčištění mezičasů ročníku (Q31, Q32), detail se snímkem smazaných řádků.
  | "raceday.splits_cleared"
  // Ruční zápis / oprava / smazání jednoho mezičasu adminem a rozhodnutí konfliktu z OBD.
  | "raceday.split_set"
  | "raceday.split_deleted"
  | "raceday.split_conflict_resolved"
  | "raceday.split_conflict_dismissed"
  // Evidence startu (#203): ruční zápis / smazání adminem a hromadné vyčištění ročníku.
  | "raceday.start_set"
  | "raceday.start_deleted"
  | "raceday.starts_cleared"
  // Přepnutí OFeed mezi testovací a ostrou akcí (Q33).
  | "raceday.ofeed_profile"
  // Testovací běh nad produkcí (#186): spuštění a ukončení s automatickým úklidem (snímek dat).
  | "raceday.test_started"
  | "raceday.test_ended"
  // Změny přihlášek od přihlašujících (#130) – podklad pro denní souhrn pořadateli.
  | "entry.created"
  | "entry.runner_added"
  | "entry.runner_removed"
  | "entry.runner_created"
  | "entry.club_created"
  | "entry.header_changed"
  | "entry.line_club_changed"
  | "entry.cancelled"
  // Závodní kancelář (#207): prodejky a ceník. Spárování z Fio je v mcvv_bank_tx (bez auditu).
  | "sale.created"
  | "sale.paid_cash"
  | "sale.paid_bank_manual"
  | "sale.cancelled"
  | "sale_item.created"
  | "sale_item.updated"
  // Ruční sloučení id klubů (#104). `club.merge` přepisuje data (Q45), detail = stav před
  // sloučením (ClubMergeAuditDetail). `club.unmerged` jen ve starých záznamech (sloučení 1.4.0).
  | "club.merge"
  | "club.merge_rejected"
  | "club.merge_restored"
  // Úklid sirotků v číselníku klubů (#193), detail = smazané řádky cis_klub
  // (OrphanCleanupAuditDetail) pro ruční obnovení.
  | "club.orphan_cleanup"
  // Denní limit e-mailů v Nastavení (#190), detail = před / po.
  | "settings.mail_limit"
  // Citlivé ruční zásahy v administraci (#107), detail = stav před / po (`diffFields`).
  // Změna pohlaví běžce = změna id v cis_bezec (#103), detail = staré / nové id a dotčené řádky.
  | "runner.sex_changed"
  // Státní příslušnost běžce (#200) změněná pořadatelem, detail = `diffFields` (nationality).
  | "runner.nationality_changed"
  | "registration.updated"
  | "registration.confirmed"
  | "payment.created"
  | "payment.updated"
  | "payment.deleted"
  // Bankovní pohyby (Fio) vyřízené ručně: označení bez platby a vrácení přeplatku.
  | "bank_tx.ignored"
  | "bank_tx.refunded"
  | "edition.created"
  | "edition.updated"
  // Kategorie včetně startovného a rekordu; klub = název v číselníku pro (id, rok).
  | "category.updated"
  | "club.updated"
  // Uložení Nastavení: změněné klíče mcvv_setting (zveřejnění startovky, URL výsledků…).
  | "settings.changed";

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
