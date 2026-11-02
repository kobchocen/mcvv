"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { applyRunnerMerge } from "@/lib/admin/runner-merge";
import { formString } from "@/lib/admin/parse";
import { requireAdmin } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { recalculateRegistrationStatus } from "@/lib/entries/status";
import { currentRaceYear } from "@/lib/entries/year";
import { PHOTOS_CACHE_TAG } from "@/lib/photos/queries";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";
import { redirect } from "@/i18n/routing";

const PATHNAME = "/admin/ciselniky/bezci/slouceni" as const;

/** Náhled: jen přesměrování na stránku s vybranou dvojicí (výpočet dělá stránka). */
export async function previewRunnerMergeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const main = formString(formData, "main");
  const other = formString(formData, "other");
  const locale = await getLocale();
  redirect({
    href: { pathname: PATHNAME, query: { hlavni: main, sloucit: other } },
    locale,
  });
}

/** Sloučení (#261): jen admin, potvrzení „nevratné“, vše v jedné transakci + audit runner.merge. */
export async function mergeRunnersAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const main = formString(formData, "main");
  const other = formString(formData, "other");
  const locale = await getLocale();
  const back = (query: Record<string, string>) =>
    redirect({ href: { pathname: PATHNAME, query }, locale });

  if (formData.get("confirm") !== "1") {
    return back({ hlavni: main, sloucit: other, chyba: "confirm" });
  }

  let result;
  try {
    result = await applyRunnerMerge(prisma, main, other, session);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "admin.runner_merge_failed",
        by: session.email,
        main,
        other,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return back({ hlavni: main, sloucit: other, chyba: "failed" });
  }
  if (!result.ok) {
    return back({ hlavni: main, sloucit: other, chyba: result.error });
  }

  // Přihlášky aktuálního ročníku, které přešly na hlavního běžce → přepočet stavu.
  const { year } = await currentRaceYear();
  const affected = new Set(
    result.plan.moved
      .filter((row) => row.table === "mcvv_prihlaska_radek" && row.year === year)
      .map((row) => Number(row.key))
      .filter((id) => Number.isInteger(id)),
  );
  for (const id of affected) {
    await recalculateRegistrationStatus(year, id);
  }

  revalidatePath("/[locale]/admin/prihlasky", "layout");
  revalidatePath("/[locale]/admin/ciselniky", "layout");
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
  revalidatePath("/[locale]/bezec/[id]", "page");
  revalidatePath("/[locale]/vysledky", "layout");
  revalidatePath("/[locale]", "page");
  revalidateTag(STATS_CACHE_TAG, "max");
  revalidateTag(PHOTOS_CACHE_TAG, "max");

  return back({ slouceno: other, do: main });
}
