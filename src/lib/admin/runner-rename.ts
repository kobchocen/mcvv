/**
 * Změna jména běžce (#198) – načtení ročníkových jmen a zápis plánu v jedné transakci.
 * Čistá logika je v `runner-rename-core.ts`; id běžce se nemění (jméno v id není).
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import {
  planRunnerRename,
  type RunnerNameRow,
  type RunnerRenameError,
  type RunnerRenameMode,
  type RunnerRenamePlan,
} from "@/lib/admin/runner-rename-core";
import type { AuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/log";

type Db = PrismaClient | Prisma.TransactionClient;

export type RunnerRenameInput = {
  runnerId: string;
  lastName: string;
  firstName: string;
  mode: RunnerRenameMode;
  fromYear: number | null;
};

export type RunnerRenameFailure = RunnerRenameError | "not_found";

/** Ročníková jména běžce z výsledků (`mcvv_time`) a startovek (`mcvv_start`). */
export async function loadRunnerNameRows(db: Db, runnerId: string): Promise<RunnerNameRow[]> {
  const [results, starts] = await Promise.all([
    db.result.findMany({ where: { runnerId }, select: { year: true, runnerName: true } }),
    db.startEntry.findMany({ where: { runnerId }, select: { year: true, runnerName: true } }),
  ]);
  return [
    ...results.map((row) => ({
      table: "mcvv_time" as const,
      year: row.year,
      name: row.runnerName,
    })),
    ...starts.map((row) => ({
      table: "mcvv_start" as const,
      year: row.year,
      name: row.runnerName,
    })),
  ];
}

/** Náhled bez zápisu (stránka běžce v Číselnících). */
export async function previewRunnerRename(
  db: Db,
  input: RunnerRenameInput,
): Promise<{ ok: true; plan: RunnerRenamePlan } | { ok: false; error: RunnerRenameFailure }> {
  const runner = await db.runner.findUnique({
    where: { id: input.runnerId },
    select: { id: true, name: true },
  });
  if (!runner) return { ok: false, error: "not_found" };
  const rows = await loadRunnerNameRows(db, runner.id);
  return planRunnerRename({ runner, ...input, rows });
}

/**
 * Přejmenování v jedné transakci: `cis_bezec.jmeno`, ročníková jména podle plánu a audit
 * `runner.name_changed` (staré jméno + seznam rok / tabulka / původní bezec_name).
 */
export async function applyRunnerRename(
  prisma: PrismaClient,
  input: RunnerRenameInput,
  actor: AuditActor,
): Promise<{ ok: true; plan: RunnerRenamePlan } | { ok: false; error: RunnerRenameFailure }> {
  return prisma.$transaction(async (tx) => {
    // Zámek řádku běžce – souběžné přejmenování / změna pohlaví čeká.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM cis_bezec WHERE id = ${input.runnerId} FOR UPDATE`;
    if (locked.length === 0) return { ok: false as const, error: "not_found" as const };
    const result = await previewRunnerRename(tx, input);
    if (!result.ok) return result;
    const { plan } = result;

    await tx.runner.update({ where: { id: plan.runnerId }, data: { name: plan.newName } });
    for (const update of plan.updates) {
      const where = { year_runnerId: { year: update.year, runnerId: plan.runnerId } };
      if (update.table === "mcvv_time") {
        await tx.result.update({ where, data: { runnerName: update.newName } });
      } else {
        await tx.startEntry.update({ where, data: { runnerName: update.newName } });
      }
    }

    await writeAudit(
      {
        actor,
        action: "runner.name_changed",
        target: `runner:${plan.runnerId}`,
        detail: {
          runnerId: plan.runnerId,
          oldName: plan.oldName,
          newName: plan.newName,
          mode: plan.mode,
          fromYear: plan.fromYear,
          rows: plan.updates.map((update) => ({
            year: update.year,
            table: update.table,
            oldName: update.oldName,
            newName: update.newName,
          })),
        },
      },
      tx,
    );
    return { ok: true as const, plan };
  });
}
