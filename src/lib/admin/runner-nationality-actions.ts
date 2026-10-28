"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { formInt, formString } from "@/lib/admin/parse";
import { requireStaff } from "@/lib/admin/staff";
import { diffFields } from "@/lib/audit/diff";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { normalizeNationality } from "@/lib/runner/nationality";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";
import { redirect } from "@/i18n/routing";

/**
 * Pořadatel nastaví / opraví státní příslušnost běžce (#200). Prázdná volba = neuvedeno.
 * Změna se zapíše do auditu (#107: cíl `runner:<id>`, detail `changes` = před / po).
 */
export async function saveRunnerNationality(formData: FormData): Promise<void> {
  const session = await requireStaff();
  const runnerId = formString(formData, "runnerId");
  const raw = formString(formData, "nationality");
  const nationality = normalizeNationality(raw);
  const backYear = formInt(formData, "year");
  const backId = formInt(formData, "registrationId");
  let outcome: "ok" | "invalid" = "ok";

  if (!runnerId || (raw.trim() !== "" && !nationality)) {
    outcome = "invalid";
  } else {
    await prisma.$transaction(async (tx) => {
      const runner = await tx.runner.findUnique({
        where: { id: runnerId },
        select: { nationality: true },
      });
      if (!runner) {
        outcome = "invalid";
        return;
      }
      if ((runner.nationality ?? null) === nationality) {
        return;
      }
      await tx.runner.update({ where: { id: runnerId }, data: { nationality } });
      await writeAudit(
        {
          actor: session,
          action: "runner.nationality_changed",
          target: `runner:${runnerId}`,
          detail: {
            changes: diffFields({ nationality: runner.nationality ?? null }, { nationality }),
          },
        },
        tx,
      );
    });
    revalidatePath("/[locale]/admin/prihlasky", "layout");
    revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
    revalidatePath("/[locale]/startovka", "page");
    revalidatePath("/[locale]/results", "page");
    revalidatePath("/[locale]/bezec/[id]", "page");
    revalidateTag(STATS_CACHE_TAG, "max");
  }

  if (backYear && backId !== null) {
    redirect({
      href: {
        pathname: "/admin/prihlasky/[rok]/[id]",
        params: { rok: String(backYear), id: String(backId) },
        ...(outcome === "invalid" ? { query: { stat: "chyba" } } : {}),
      },
      locale: await getLocale(),
    });
  }
}
