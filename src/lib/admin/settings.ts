"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/lib/admin/staff";
import { saveFreeEntryEmails } from "@/lib/entries/settings";
import { normalizeMoment, parseHttpUrl, saveSiteSettings } from "@/lib/settings/site";
import { parseEmail, saveMessageSettings } from "@/lib/settings/messages";
import { redirect } from "@/i18n/routing";

/** Public pages that render site settings (hero phase, start list, instructions, stats). */
function revalidateSettingPages() {
  revalidatePath("/[locale]/admin/nastaveni", "page");
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/startovka", "page");
  revalidatePath("/[locale]/pokyny", "page");
  revalidatePath("/[locale]/statistiky", "page");
  revalidatePath("/[locale]/vysledky", "page");
  revalidatePath("/[locale]/kontakt", "page");
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/zpravy", "page");
}

export async function saveSettings(formData: FormData): Promise<void> {
  await requireAdmin();
  const locale = await getLocale();
  const url = parseHttpUrl(String(formData.get("onlineResultsUrl") ?? ""));
  if (!url.ok) {
    redirect({ href: { pathname: "/admin/nastaveni", query: { error: "url" } }, locale });
  }
  const onlineResultsUrl = url.ok ? url.value : null;
  const organizerEmailRaw = String(formData.get("organizerEmail") ?? "").trim();
  const organizerEmail = organizerEmailRaw ? parseEmail(organizerEmailRaw) : "";
  if (organizerEmail === null) {
    redirect({ href: { pathname: "/admin/nastaveni", query: { error: "email" } }, locale });
  }
  const emails = String(formData.get("emails") ?? "");
  await saveFreeEntryEmails(emails);
  await saveSiteSettings({
    startlistPublished: formData.get("startlistPublished") === "on",
    onlineResultsUrl,
    statsMoment: normalizeMoment(String(formData.get("statsMoment") ?? "")),
  });
  await saveMessageSettings({
    enabled: formData.get("messagesEnabled") === "on",
    notifyOrganizer: formData.get("messagesNotifyOrganizer") === "on",
    notifyUser: formData.get("messagesNotifyUser") === "on",
    organizerEmail: organizerEmail ?? "",
  });
  revalidateSettingPages();
  redirect({ href: { pathname: "/admin/nastaveni", query: { saved: "1" } }, locale });
}
