"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { formInt, formString } from "@/lib/admin/parse";
import type { RunnerRenameMode } from "@/lib/admin/runner-rename-core";
import { applyRunnerRename, type RunnerRenameFailure } from "@/lib/admin/runner-rename";
import { requireAdmin } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { PHOTOS_CACHE_TAG } from "@/lib/photos/queries";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";
import { redirect } from "@/i18n/routing";

/** Formulářová hodnota režimu → režim plánu (`od` = od ročníku X, jinak všude). */
function modeOf(value: string): RunnerRenameMode {
  return value === "od" ? "from" : "all";
}

/**
 * Přejmenování běžce (#198), jen admin. Jedna transakce + audit `runner.name_changed`;
 * pak obnoví profil běžce, výsledky, statistiky a fotky (jména v cache) a vrátí se na
 * detail běžce v Číselnících.
 */
export async function renameRunnerAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const runnerId = formString(formData, "runnerId");
  const lastName = formString(formData, "prijmeni");
  const firstName = formString(formData, "jmeno");
  const modeValue = formString(formData, "rezim") === "od" ? "od" : "vse";
  const fromYear = formInt(formData, "od");
  const back = formString(formData, "z");
  const locale = await getLocale();

  let error: RunnerRenameFailure | "failed" | null = null;
  try {
    const result = await applyRunnerRename(
      prisma,
      { runnerId, lastName, firstName, mode: modeOf(modeValue), fromYear },
      session,
    );
    if (!result.ok) error = result.error;
  } catch (cause) {
    console.error(
      JSON.stringify({
        event: "admin.runner_rename_failed",
        by: session.email,
        runnerId,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
    );
    error = "failed";
  }

  if (error) {
    redirect({
      href: {
        pathname: "/admin/ciselniky/bezci/[id]",
        params: { id: runnerId },
        query: {
          prijmeni: lastName,
          jmeno: firstName,
          rezim: modeValue,
          ...(fromYear ? { od: String(fromYear) } : {}),
          ...(back ? { z: back } : {}),
          chyba: error,
        },
      },
      locale,
    });
  }

  revalidatePath("/[locale]/admin/ciselniky", "layout");
  revalidatePath("/[locale]/admin/prihlasky", "layout");
  revalidatePath("/[locale]/bezec/[id]", "page");
  revalidatePath("/[locale]/results", "layout");
  revalidatePath("/[locale]/vysledky", "layout");
  revalidatePath("/[locale]/statistiky", "layout");
  revalidatePath("/[locale]/startovka", "layout");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
  revalidatePath("/[locale]", "page");
  revalidateTag(STATS_CACHE_TAG, "max");
  revalidateTag(PHOTOS_CACHE_TAG, "max");

  redirect({
    href: {
      pathname: "/admin/ciselniky/bezci/[id]",
      params: { id: runnerId },
      query: { prejmenovano: "1", ...(back ? { z: back } : {}) },
    },
    locale,
  });
}
