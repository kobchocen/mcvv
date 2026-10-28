"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/lib/admin/staff";
import { formString } from "@/lib/admin/parse";
import { writeAudit } from "@/lib/audit/log";
import { isOrphanScope, orphanAuditDetail } from "@/lib/clubs/orphans";
import { deleteOrphanRows, previewOrphanCleanup } from "@/lib/clubs/orphans-apply";
import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";
import { redirect } from "@/i18n/routing";

/**
 * Úklid sirotků v číselníku klubů (#193). Jen admin, nikdy automaticky: náhled na stránce
 * `/admin/ciselniky/kluby/sirotci` (dry-run) → zaškrtnuté potvrzení → smazání v jedné
 * transakci. Smaže se jen přesně to, co bylo v náhledu (otisk seznamu); pokud se mezitím
 * něco změnilo, vrátí se na nový náhled. Audit `club.orphan_cleanup` drží smazané řádky.
 */
async function back(query: Record<string, string>): Promise<never> {
  const locale = await getLocale();
  redirect({ href: { pathname: "/admin/ciselniky/kluby/sirotci", query }, locale });
  throw new Error("unreachable");
}

export async function confirmOrphanCleanup(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const scope = formString(formData, "rozsah");
  if (!isOrphanScope(scope)) {
    return back({ chyba: "rozsah" });
  }
  if (formString(formData, "nevratne") !== "ano") {
    return back({ rozsah: scope, chyba: "potvrzeni" });
  }
  const fingerprint = formString(formData, "otisk");
  const { year: currentYear } = await currentRaceYear();

  const result = await prisma
    .$transaction(
      async (tx) => {
        const plan = await previewOrphanCleanup(tx, { scope, currentYear });
        if (plan.fingerprint !== fingerprint) return { ok: false as const };
        if (plan.rows.length === 0) return { ok: true as const, deleted: 0 };
        const deleted = await deleteOrphanRows(tx, plan.rows);
        if (deleted !== plan.rows.length) {
          // Souběžná změna (nová přihláška ke klubu) – nic nemazat, ukázat nový náhled.
          throw new OrphanCleanupChanged();
        }
        await writeAudit(
          {
            actor: session,
            action: "club.orphan_cleanup",
            target: "clubs",
            detail: orphanAuditDetail(plan),
          },
          tx,
        );
        return { ok: true as const, deleted };
      },
      { timeout: 60_000, maxWait: 10_000 },
    )
    .catch((error: unknown) => {
      if (error instanceof OrphanCleanupChanged) return { ok: false as const };
      throw error;
    });

  if (!result.ok) {
    return back({ rozsah: scope, chyba: "zmena" });
  }
  revalidatePath("/[locale]/admin/ciselniky", "layout");
  revalidatePath("/[locale]/kluby", "layout");
  revalidateTag(STATS_CACHE_TAG, "max");
  return back({ rozsah: scope, smazano: String(result.deleted) });
}

class OrphanCleanupChanged extends Error {}
