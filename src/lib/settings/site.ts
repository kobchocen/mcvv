import { prisma } from "@/lib/db/client";

import {
  ONLINE_RESULTS_URL_KEY,
  SITE_SETTING_KEYS,
  siteSettingsFromRows,
  STARTLIST_DRAWN_KEY,
  STARTLIST_PUBLISHED_KEY,
  STATS_MOMENT_KEY,
  type SiteSettings,
} from "./site-core";

export * from "./site-core";

export async function getSiteSettings(): Promise<SiteSettings> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [...SITE_SETTING_KEYS] } },
    select: { key: true, text: true },
  });
  return siteSettingsFromRows(rows);
}

/** Uložení z formuláře nastavení (potvrzené losování se tu nemění). */
export async function saveSiteSettings(
  settings: Omit<SiteSettings, "startlistDrawnYear">,
): Promise<void> {
  const entries: [string, string][] = [
    [STARTLIST_PUBLISHED_KEY, settings.startlistPublished ? "1" : "0"],
    [ONLINE_RESULTS_URL_KEY, settings.onlineResultsUrl ?? ""],
    [STATS_MOMENT_KEY, settings.statsMoment],
  ];
  await prisma.$transaction(
    entries.map(([key, text]) =>
      prisma.setting.upsert({ where: { key }, update: { text }, create: { key, text } }),
    ),
  );
}

/** Potvrzení losování ročníku: zapíše ročník losování a startovku hned zveřejní. */
export async function confirmStartlistDraw(year: number): Promise<void> {
  const entries: [string, string][] = [
    [STARTLIST_DRAWN_KEY, String(year)],
    [STARTLIST_PUBLISHED_KEY, "1"],
  ];
  await prisma.$transaction(
    entries.map(([key, text]) =>
      prisma.setting.upsert({ where: { key }, update: { text }, create: { key, text } }),
    ),
  );
}
