"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { requireSection } from "@/lib/admin/access";
import { writeAudit } from "@/lib/audit/log";
import { withSettingsAudit } from "@/lib/audit/settings-audit";
import { cashDeskActionSession } from "@/lib/sales/guard";

import { configFromForm } from "./config-core";
import { saveTestModeConfig } from "./config";
import { TEST_MODE_CONFIG_KEY } from "./config-core";
import { testOnsiteSchema } from "./onsite-core";
import {
  cleanupTestModeRun,
  createTestOnsite,
  endTestModeRun,
  startTestModeRun,
  type TestOnsiteError,
} from "./run";

const TEST_ONSITE_FIELDS = [
  "firstName",
  "lastName",
  "birthYear",
  "sex",
  "categoryId",
  "clubName",
  "bib",
  "payment",
] as const;

const PAGE = "/admin/den-zavodu/test-rezim" as const;

async function back(query: Record<string, string>): Promise<never> {
  const locale = await getLocale();
  revalidatePath("/[locale]/admin/den-zavodu/test-rezim", "page");
  redirect({ href: { pathname: PAGE, query }, locale });
  throw new Error("unreachable");
}

/** Uloží výchozí hodnoty testovacího režimu (otevřené otázky návrhu §9). */
export async function saveTestModeConfigAction(formData: FormData): Promise<void> {
  const session = await requireSection("raceControl.live", "write");
  await withSettingsAudit(
    session,
    "raceday.testmode_config_changed",
    [TEST_MODE_CONFIG_KEY],
    async () => {
      const parsed = configFromForm((name) => formData.get(name)?.toString() ?? null);
      if (!parsed.ok) await back({ error: parsed.error });
      else {
        await saveTestModeConfig(parsed.config);
        await back({ saved: "1" });
      }
    },
  );
}

/** Spustit test teď (T = teď, nula T+1h). */
export async function startTestModeNowAction(): Promise<void> {
  const session = await requireSection("raceControl.live", "write");
  const result = await startTestModeRun(session, {
    createdBy: session.name?.trim() || session.email,
    source: "manual",
  });
  await back(result.ok ? { run: "started" } : { runError: result.error });
}

/** Ukončit běžící test hned (zápisy se zamknou, spočítá se report). */
export async function endTestModeNowAction(formData: FormData): Promise<void> {
  const session = await requireSection("raceControl.live", "write");
  const id = Number(formData.get("runId"));
  const ok = Number.isInteger(id) && (await endTestModeRun(id, session));
  await back(ok ? { run: "ended" } : { runError: "state" });
}

/** Zlikvidovat data testu hned (stínový ročník a testovací startovka; report zůstává). */
export async function cleanupTestModeNowAction(formData: FormData): Promise<void> {
  const session = await requireSection("raceControl.live", "write");
  const id = Number(formData.get("runId"));
  const ok = Number.isInteger(id) && (await cleanupTestModeRun(id, session));
  await back(ok ? { run: "cleaned" } : { runError: "state" });
}

/**
 * Pokladna v testu: testovací dohláška (jen `mcvv_test_*`, platba simulovaná). Žádná ostrá
 * přihláška, běžec, prodejka ani e-mail.
 */
export async function createTestOnsiteAction(
  input: Partial<Record<string, string>>,
): Promise<
  { ok: true; bib: number } | { ok: false; error: TestOnsiteError | "forbidden" | "invalid" }
> {
  const session = await cashDeskActionSession();
  if (!session) return { ok: false, error: "forbidden" };
  const raw: Record<string, string> = {};
  for (const key of TEST_ONSITE_FIELDS) {
    const value = input?.[key];
    if (typeof value === "string") raw[key] = value.slice(0, 120);
  }
  const parsed = testOnsiteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await createTestOnsite(session.name?.trim() || session.email, parsed.data);
  if (result.ok) {
    await writeAudit({
      actor: session,
      action: "raceday.testmode_onsite",
      target: `testrun:${result.runId}`,
      detail: { bib: result.bib, payment: parsed.data.payment },
    });
    revalidatePath("/[locale]/kancelar", "page");
    return { ok: true, bib: result.bib };
  }
  return result;
}
