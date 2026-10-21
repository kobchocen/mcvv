import { prisma } from "@/lib/db/client";
import type { StatSlug } from "@/lib/stats/core";
import { loadStatsSlug } from "@/lib/stats/tables";

import type { StatsReport } from "./render-stats";
import { statsTranslator } from "./stats-labels";

/** Data jednostránkové tiskové sestavy pro statistiku `slug` (česky). */
export async function loadStatsReport(slug: StatSlug, now = new Date()): Promise<StatsReport> {
  const t = statsTranslator();
  const [data, range] = await Promise.all([
    loadStatsSlug(slug, t),
    prisma.result.aggregate({ _min: { year: true }, _max: { year: true } }),
  ]);
  const from = range._min.year;
  const to = range._max.year;
  return {
    slug,
    title: t(`${slug}.title`),
    intro: t(`${slug}.intro`),
    eyebrow: from && to ? `${t("eyebrow")} · ${from}–${to}` : t("eyebrow"),
    tables: data.tables,
    chart: data.chart,
    chartCaption: data.chartCaption,
    menLabel: t("men"),
    womenLabel: t("women"),
    emptyText: t("empty"),
    generatedAt: now,
  };
}

export function statsFilename(slug: StatSlug): string {
  return `mcvv-statistiky-${slug}.pdf`;
}
