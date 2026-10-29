"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/routing";
import { requireStaff } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";

import { resultboardInfoCache } from "./resultboard";
import { RESULTBOARD_CONFIG_KEY, parseResultboardConfig } from "./resultboard-core";

/**
 * Uloží nastavení resultboardu (Q143): smí admin i pořadatel. Formulář posílá celé
 * nastavení jako JSON; co neprojde kontrolou, nahradí výchozí hodnota. Obrazovky si změnu
 * načtou do 30 s (na této replice hned – cache se smaže).
 */
export async function saveResultboardAction(formData: FormData): Promise<void> {
  await requireStaff();
  const raw = String(formData.get("config") ?? "").slice(0, 20_000);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const locale = await getLocale();
  if (parsed === null || typeof parsed !== "object") {
    redirect({
      href: { pathname: "/admin/den-zavodu/zive", query: { error: "resultboard" } },
      locale,
    });
    return;
  }
  const text = JSON.stringify(parseResultboardConfig(parsed));
  await prisma.setting.upsert({
    where: { key: RESULTBOARD_CONFIG_KEY },
    update: { text },
    create: { key: RESULTBOARD_CONFIG_KEY, text },
  });
  resultboardInfoCache.clear();
  revalidatePath("/[locale]/admin/den-zavodu/zive", "page");
  redirect({
    href: { pathname: "/admin/den-zavodu/zive", query: { saved: "resultboard" } },
    locale,
  });
}
