"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { applySexChange, previewSexChange, SexChangeError } from "@/lib/admin/runner-rekey";
import type { SexChangePlan } from "@/lib/admin/runner-sex-core";
import { requireStaff } from "@/lib/admin/staff";
import { formInt, formString } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { recalculateRegistrationStatus } from "@/lib/entries/status";
import { currentRaceYear } from "@/lib/entries/year";
import { PHOTOS_CACHE_TAG } from "@/lib/photos/queries";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";
import { redirect } from "@/i18n/routing";

export type SexChangeErrorCode = "not_found" | "invalid_id" | "collision" | "failed";

export type SexChangePreviewResult =
  { ok: true; plan: SexChangePlan } | { ok: false; error: SexChangeErrorCode };

export type SexChangeState = { error?: SexChangeErrorCode };

function errorCode(error: unknown): SexChangeErrorCode {
  if (error instanceof SexChangeError) {
    return error.code;
  }
  // Unique constraint (a concurrent insert took the new id) → ask to retry.
  if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
    return "collision";
  }
  return "failed";
}

/** Read-only preview for the confirmation dialog (old → new id, categories, fees). */
export async function previewRunnerSexChange(runnerId: string): Promise<SexChangePreviewResult> {
  await requireStaff();
  const { year } = await currentRaceYear();
  try {
    return { ok: true, plan: await previewSexChange(prisma, runnerId, year) };
  } catch (error) {
    return { ok: false, error: errorCode(error) };
  }
}

export async function changeRunnerSex(
  _prev: SexChangeState,
  formData: FormData,
): Promise<SexChangeState> {
  const session = await requireStaff();
  const runnerId = formString(formData, "runnerId");
  const backYear = formInt(formData, "year");
  const backId = formInt(formData, "registrationId");
  const recategorizeResults = formString(formData, "recategorizeResults") === "on";
  const { year: currentYear } = await currentRaceYear();

  let outcome;
  try {
    outcome = await applySexChange(prisma, { runnerId, currentYear, recategorizeResults });
  } catch (error) {
    const code = errorCode(error);
    console.error(
      JSON.stringify({
        event: "admin.runner_sex_change_failed",
        by: session.email,
        runnerId,
        code,
      }),
    );
    return { error: code };
  }

  // Fees of the current year may have changed → refresh affected applications.
  const affected = new Set(
    outcome.lines.filter((line) => line.year === currentYear).map((line) => line.registrationId),
  );
  for (const id of affected) {
    await recalculateRegistrationStatus(currentYear, id);
  }

  // Audit trail (no audit table exists yet): one structured log line per change.
  console.info(
    JSON.stringify({
      event: "admin.runner_sex_changed",
      by: session.email,
      at: new Date().toISOString(),
      oldId: outcome.oldId,
      newId: outcome.newId,
      newSex: outcome.newSex,
      counts: outcome.counts,
      recategorizeResults,
      lines: outcome.lines.map((line) => ({
        year: line.year,
        registrationId: line.registrationId,
        category: [line.oldCategory.id, line.newCategory?.id ?? line.oldCategory.id],
        fee: [line.oldFee, line.newFee],
      })),
    }),
  );

  revalidatePath("/[locale]/admin/prihlasky", "layout");
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
  revalidatePath("/[locale]/bezec/[id]", "page");
  revalidatePath("/[locale]/results/[year]", "page");
  revalidatePath("/[locale]", "page");
  revalidateTag(STATS_CACHE_TAG, "max");
  revalidateTag(PHOTOS_CACHE_TAG, "max");

  const locale = await getLocale();
  if (backYear && backId !== null) {
    redirect({
      href: {
        pathname: "/admin/prihlasky/[rok]/[id]",
        params: { rok: String(backYear), id: String(backId) },
        query: { sex: `${outcome.oldId}-${outcome.newId}` },
      },
      locale,
    });
  }
  return {};
}
