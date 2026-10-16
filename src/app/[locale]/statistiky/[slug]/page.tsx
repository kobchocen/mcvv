import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  McvvStatsPage,
  type McvvHomepageContent,
  type StatsCell,
  type StatsTable,
} from "@/components/templates";
import {
  getAbsoluteWinners,
  getAgeRecords,
  getAttendance,
  getRecordEvolution,
  getTopTimesBySex,
  getVeteranClub,
  isStatSlug,
  type StatSlug,
} from "@/lib/stats/queries";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string; slug: string }>;
}>;

type StatsT = Awaited<ReturnType<typeof getTranslations>>;

function cell(text: string, runnerId?: string): StatsCell {
  return runnerId ? { text, runnerId } : { text };
}

async function loadSlug(
  slug: StatSlug,
  t: StatsT,
): Promise<{
  tables: StatsTable[];
  chart?: { year: number; men: number; women: number }[];
  chartCaption?: string;
}> {
  switch (slug) {
    case "rekordy": {
      const groups = await getRecordEvolution();
      return {
        tables: groups.map((group) => ({
          title: group.category,
          columns: [t("colYear"), t("colName"), t("colBirth"), t("colClub"), t("colTime")],
          rows: group.rows.map((row) => [
            cell(String(row.year)),
            cell(row.name, row.runnerId),
            cell(row.birthYear),
            cell(row.club),
            cell(row.time),
          ]),
        })),
      };
    }
    case "vitezove": {
      const rows = await getAbsoluteWinners();
      return {
        tables: [
          {
            columns: [t("colYear"), t("men"), t("menTime"), t("women"), t("womenTime")],
            rows: rows.map((row) => [
              cell(String(row.year)),
              cell(row.menName, row.menId),
              cell(row.menTime),
              cell(row.womenName, row.womenId),
              cell(row.womenTime),
            ]),
          },
        ],
      };
    }
    case "casy": {
      const { men, women } = await getTopTimesBySex();
      const columns = [
        t("colRank"),
        t("colYear"),
        t("colName"),
        t("colBirth"),
        t("colClub"),
        t("colTime"),
      ];
      const toRows = (list: typeof men) =>
        list.map((row) => [
          cell(String(row.rank)),
          cell(String(row.year)),
          cell(row.name, row.runnerId),
          cell(row.birthYear),
          cell(row.club),
          cell(row.time),
        ]);
      return {
        tables: [
          { title: t("men"), columns, rows: toRows(men) },
          { title: t("women"), columns, rows: toRows(women) },
        ],
      };
    }
    case "vek": {
      const rows = await getAgeRecords();
      return {
        tables: [
          {
            columns: [
              t("colAge"),
              t("menYear"),
              t("men"),
              t("menTime"),
              t("womenYear"),
              t("women"),
              t("womenTime"),
            ],
            rows: rows.map((row) => [
              cell(String(row.age)),
              cell(row.menYear ? String(row.menYear) : ""),
              cell(row.menName ?? "", row.menId),
              cell(row.menTime ?? ""),
              cell(row.womenYear ? String(row.womenYear) : ""),
              cell(row.womenName ?? "", row.womenId),
              cell(row.womenTime ?? ""),
            ]),
          },
        ],
      };
    }
    case "veterani": {
      const { men, women } = await getVeteranClub();
      const columns = [
        t("colRank"),
        t("colName"),
        t("colBirth"),
        t("colStarts"),
        t("colRecord"),
        t("colAverage"),
      ];
      const toRows = (list: typeof men) =>
        list.map((row) => [
          cell(String(row.rank)),
          cell(row.name, row.runnerId),
          cell(row.birthYear),
          cell(String(row.starts)),
          cell(row.record),
          cell(row.average),
        ]);
      return {
        tables: [
          { title: t("men"), columns, rows: toRows(men) },
          { title: t("women"), columns, rows: toRows(women) },
        ],
      };
    }
    case "ucast": {
      const rows = await getAttendance();
      const tableRows = [...rows].sort((a, b) => b.year - a.year);
      return {
        chart: rows.map((row) => ({ year: row.year, men: row.men, women: row.women })),
        chartCaption: t("chartCaption"),
        tables: [
          {
            columns: [
              t("colYear"),
              t("colCount"),
              t("colNewcomers"),
              t("colPrs"),
              t("colBest"),
              t("colAverage"),
            ],
            rows: tableRows.map((row) => [
              cell(String(row.year)),
              cell(String(row.count)),
              cell(String(row.newcomers)),
              cell(String(row.personalRecords)),
              cell(row.best),
              cell(row.average),
            ]),
          },
        ],
      };
    }
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale, slug } = await params;
  if (!isStatSlug(slug)) {
    return {};
  }
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Stats" });
  return { title: t(`${slug}.title`) };
}

export default async function StatsSlugPage({ params }: PageProps) {
  const { locale: requestedLocale, slug } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  if (!isStatSlug(slug)) {
    notFound();
  }

  const home = await getTranslations({ locale, namespace: "Home" });
  const stats = await getTranslations({ locale, namespace: "Stats" });
  const { tables, chart, chartCaption } = await loadSlug(slug, stats);

  return (
    <McvvStatsPage
      brand={home.raw("brand") as McvvHomepageContent["brand"]}
      nav={home.raw("nav") as McvvHomepageContent["nav"]}
      eyebrow={stats("eyebrow")}
      title={stats(`${slug}.title`)}
      intro={stats(`${slug}.intro`)}
      tables={tables}
      chart={chart}
      chartCaption={chartCaption}
      chartMenLabel={stats("men")}
      chartWomenLabel={stats("women")}
      empty={stats("empty")}
      back={stats("back")}
    />
  );
}

export const dynamic = "force-dynamic";
