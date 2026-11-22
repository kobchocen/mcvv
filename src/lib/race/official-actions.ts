"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireSection } from "@/lib/admin/access";
import { redirect } from "@/i18n/routing";
import { HOME_COUNTS_TAG } from "@/lib/home/summary-core";
import { onlineResultsCache } from "@/lib/live/online-results";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";

import { markOfficialChecked, publishOfficialResults, setLiveWindowMode } from "./official";

const PAGE = "/admin/den-zavodu/vysledky" as const;

async function back(query: Record<string, string>): Promise<never> {
  const locale = await getLocale();
  revalidatePath("/[locale]/admin/den-zavodu/vysledky", "page");
  redirect({ href: { pathname: PAGE, query }, locale });
  throw new Error("unreachable");
}

/** Úvodní stránka, archiv výsledků a živý snímek hned (jinak až 60 s / 5 s). */
function invalidatePublic() {
  onlineResultsCache.clear();
  revalidateTag(HOME_COUNTS_TAG, "max");
  revalidateTag(STATS_CACHE_TAG, "max");
}

function hashOf(formData: FormData): string {
  return String(formData.get("hash") ?? "").slice(0, 64);
}

/** Hlavní rozhodčí potvrdí zkontrolovaný náhled (oprávnění `raceControl.officialCheck`). */
export async function officialCheckAction(formData: FormData): Promise<void> {
  const session = await requireSection("raceControl.officialCheck", "write");
  const result = await markOfficialChecked(session, hashOf(formData));
  return back(result === "ok" ? { saved: "checked" } : { error: result });
}

/** Zveřejnění oficiálních výsledků (oprávnění `raceControl.official`, potvrzení zaškrtnutím). */
export async function officialPublishAction(formData: FormData): Promise<void> {
  const session = await requireSection("raceControl.official", "write");
  if (formData.get("confirm") !== "1") return back({ error: "confirm" });
  const result = await publishOfficialResults(session, hashOf(formData));
  if (!result.ok) return back({ error: result.error });
  invalidatePublic();
  return back({ saved: "published" });
}

/** Ruční otevření / nouzové zavření / automatika okna živých výsledků (audit). */
export async function liveWindowAction(formData: FormData): Promise<void> {
  const session = await requireSection("raceControl.live", "write");
  const mode = String(formData.get("mode") ?? "");
  if (mode !== "auto" && mode !== "open" && mode !== "closed") return back({ error: "invalid" });
  await setLiveWindowMode(session, mode);
  invalidatePublic();
  return back({ saved: `window-${mode}` });
}
