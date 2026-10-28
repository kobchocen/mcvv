"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/staff";
import { getOfeedSettings } from "@/lib/ofeed/settings";

import {
  endTestRun,
  getActiveTestRun,
  getTestCutoff,
  resolveTestZero,
  startTestRun,
  validateTestStart,
} from "./test-run";

async function back(query: Record<string, string>): Promise<never> {
  const locale = await getLocale();
  for (const path of [
    "/[locale]/admin/den-zavodu",
    "/[locale]/admin/den-zavodu/zive",
    "/[locale]/admin/den-zavodu/zive/casy",
    "/[locale]/admin/den-zavodu/start",
    "/[locale]/mezicasy",
  ]) {
    revalidatePath(path, "page");
  }
  redirect({ href: { pathname: "/admin/den-zavodu/zive", query }, locale });
  throw new Error("unreachable");
}

/** „Spustit test“ (#186, Q69): jen admin, jen před dnem závodu, jen s testovacím profilem OFeed. */
export async function startTestRunAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const now = new Date();
  const [active, cutoff, ofeed] = await Promise.all([
    getActiveTestRun(now),
    getTestCutoff(now),
    getOfeedSettings(),
  ]);
  const zero = resolveTestZero(
    String(formData.get("zeroChoice") ?? ""),
    String(formData.get("zeroCustom") ?? ""),
    now,
  );
  const error = validateTestStart({
    now,
    zero,
    cutoff,
    active,
    ofeedProfile: ofeed.profile,
    ofeedTestEventId: ofeed.profiles.test.eventId,
  });
  if (error) await back({ testError: error });
  await startTestRun(zero!, session, now);
  await back({ test: "started" });
}

/** „Ukončit test“: ukončí a automaticky uklidí (Q71), bez dalšího potvrzení. */
export async function endTestRunAction(): Promise<void> {
  const session = await requireAdmin();
  const result = await endTestRun("manual", session);
  await back(result ? { test: "ended" } : { testError: "notActive" });
}
