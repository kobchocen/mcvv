"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { requireSection } from "@/lib/admin/access";
import { withSettingsAudit } from "@/lib/audit/settings-audit";

import { configFromForm } from "./config-core";
import { saveTestModeConfig } from "./config";
import { TEST_MODE_CONFIG_KEY } from "./config-core";

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
