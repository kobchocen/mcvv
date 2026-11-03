"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { formString } from "@/lib/admin/parse";
import { deleteOrphanRunners } from "@/lib/admin/runner-orphans";
import {
  isRunnerId,
  runnerDeleteAuditDetail,
  selectedRunnerIds,
} from "@/lib/admin/runner-orphans-core";
import { requireAdmin } from "@/lib/admin/staff";
import { writeAudit, type AuditActor } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";
import { redirect } from "@/i18n/routing";

/**
 * Smazání běžce bez navázaných dat: jednotlivě z detailu běžce, hromadně ze stránky
 * `/admin/ciselniky/bezci/sirotci`. Jen admin, jen po potvrzení; server v transakci znovu
 * ověří, že běžec nemá žádnou vazbu (zámek řádků + NOT EXISTS v DELETE). Když se mezitím
 * něco změnilo (např. nová přihláška), nesmaže se nic. Audit drží smazané řádky cis_bezec.
 */
class RunnersChanged extends Error {}

async function deleteInTransaction(
  ids: string[],
  actor: AuditActor,
  source: "single" | "orphans",
): Promise<{ ok: true; deleted: number } | { ok: false }> {
  return prisma
    .$transaction(
      async (tx) => {
        const { rows, deleted } = await deleteOrphanRunners(tx, ids);
        if (deleted !== ids.length || rows.length !== ids.length) {
          // Některý běžec mezitím dostal data nebo zmizel – nic nemazat (rollback).
          throw new RunnersChanged();
        }
        await writeAudit(
          {
            actor,
            action: source === "single" ? "runner.deleted" : "runner.orphan_cleanup",
            target: source === "single" ? `runner:${ids[0]}` : "runners",
            detail: runnerDeleteAuditDetail(source, rows),
          },
          tx,
        );
        return { ok: true as const, deleted };
      },
      { timeout: 60_000, maxWait: 10_000 },
    )
    .catch((error: unknown) => {
      if (error instanceof RunnersChanged) return { ok: false as const };
      throw error;
    });
}

function revalidateRunners() {
  revalidatePath("/[locale]/admin/ciselniky", "layout");
  revalidatePath("/[locale]/bezec/[id]", "page");
  revalidateTag(STATS_CACHE_TAG, "max");
}

/** Smazání jednoho běžce z detailu (potvrzovací dialog). */
export async function deleteRunnerAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const locale = await getLocale();
  const runnerId = formString(formData, "runnerId");
  if (!isRunnerId(runnerId)) {
    redirect({ href: "/admin/ciselniky/bezci", locale });
    return;
  }
  const backToDetail = (chyba: string) =>
    redirect({
      href: {
        pathname: "/admin/ciselniky/bezci/[id]",
        params: { id: runnerId },
        query: { smazani: chyba },
      },
      locale,
    });
  if (formString(formData, "potvrzeno") !== "ano") {
    backToDetail("potvrzeni");
    return;
  }
  const result = await deleteInTransaction([runnerId], session, "single");
  if (!result.ok) {
    backToDetail("vazby");
    return;
  }
  revalidateRunners();
  redirect({ href: { pathname: "/admin/ciselniky/bezci", query: { smazan: runnerId } }, locale });
}

/** Hromadné smazání vybraných sirotků (seznam se zaškrtnutím → potvrzení). */
export async function confirmRunnerOrphanCleanup(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const locale = await getLocale();
  const back = (query: Record<string, string>) =>
    redirect({ href: { pathname: "/admin/ciselniky/bezci/sirotci", query }, locale });
  const ids = selectedRunnerIds(formData.getAll("id"));
  if (ids.length === 0) {
    back({ chyba: "vyber" });
    return;
  }
  if (formString(formData, "nevratne") !== "ano") {
    back({ chyba: "potvrzeni" });
    return;
  }
  const result = await deleteInTransaction(ids, session, "orphans");
  if (!result.ok) {
    back({ chyba: "zmena" });
    return;
  }
  revalidateRunners();
  back({ smazano: String(result.deleted) });
}
