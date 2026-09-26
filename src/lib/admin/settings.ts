"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/staff";
import { saveFreeEntryEmails } from "@/lib/entries/settings";

export async function saveSettings(formData: FormData): Promise<void> {
  await requireAdmin();
  const emails = String(formData.get("emails") ?? "");
  await saveFreeEntryEmails(emails);
  revalidatePath("/[locale]/admin/nastaveni", "page");
}
