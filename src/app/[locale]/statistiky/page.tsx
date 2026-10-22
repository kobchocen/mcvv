import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { STATS_OVERVIEW_SLUG } from "@/components/molecules";
import {
  McvvStatsOverview,
  type McvvHomepageContent,
  type McvvStatsOverviewCopy,
} from "@/components/templates";
import { getSiteSettings, splitMoment } from "@/lib/settings/site";
import { COURSE_CLIMB_M, COURSE_KM } from "@/lib/stats/overview";
import { getStatsOverview } from "@/lib/stats/overview-query";
import { STAT_SLUGS } from "@/lib/stats/core";
import { formatRaceTime } from "@/lib/utils";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Stats" });
  return { title: t("overview.metaTitle") };
}

export default async function StatsIndexPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const home = await getTranslations({ locale, namespace: "Home" });
  const stats = await getTranslations({ locale, namespace: "Stats" });
  const t = await getTranslations({ locale, namespace: "Stats.overview" });
  const [data, settings] = await Promise.all([getStatsOverview(), getSiteSettings()]);

  const intl = locale === "cs" ? "cs-CZ" : "en-GB";
  const number = (value: number) => new Intl.NumberFormat(intl).format(value);
  const decimal = (value: number) =>
    new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format(value);
  const percent = (share: number) =>
    new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 0 }).format(share);
  const gap = (seconds: number) =>
    seconds < 60
      ? t("gapSeconds", { seconds })
      : t("gapMinutes", { time: formatRaceTime(seconds) });

  const records = data.courseRecords;
  const prBest = data.personalRecords?.best ?? null;
  const trend = data.women.trend;
  const moment = splitMoment(settings.statsMoment);

  const copy: McvvStatsOverviewCopy = {
    eyebrow: t("eyebrow", { from: data.firstYear, to: data.lastYear }),
    title: t("title", { n: data.editions }),
    lead: t("lead", { from: data.firstYear }),
    counters: [
      {
        value: number(data.editions),
        label: t("counterEditions"),
        sub: t("counterEditionsSub", { from: data.firstYear }),
      },
      { value: number(data.starts), label: t("counterStarts"), sub: t("counterStartsSub") },
      { value: number(data.runners), label: t("counterRunners"), sub: t("counterRunnersSub") },
      {
        value: number(data.km),
        unit: "km",
        label: t("counterKm"),
        sub: t("counterKmSub", { starts: number(data.starts), km: decimal(COURSE_KM) }),
      },
    ],
    top: t("top"),
    men: stats("men"),
    women: stats("women"),
    more: {
      records: t("moreRecords"),
      wins: t("moreWins"),
      photos: t("morePhotos"),
      winners: t("moreWinners"),
      attendance: t("moreAttendance"),
      ages: t("moreAges"),
      times: t("moreTimes"),
    },
    records: {
      title: t("records"),
      sameYear:
        records.M && records.F && records.M.year === records.F.year ? t("recordsSameYear") : null,
    },
    wins: { title: t("wins") },
    photos: { title: t("photos"), total: t("photosTotal", { total: number(data.photos.total) }) },
    closest: { title: t("closest") },
    margin: { title: t("margin") },
    vs: t("vs"),
    prs: {
      title: t("prs"),
      big: data.personalRecords ? number(data.personalRecords.count) : "—",
      unit: t("prsUnit", {
        count: data.personalRecords?.count ?? 0,
        year: data.personalRecords?.year ?? 0,
      }),
      best: prBest
        ? t("prsBest", {
            gap: gap(prBest.improvement),
            previous: formatRaceTime(prBest.previous),
            time: formatRaceTime(prBest.time),
          })
        : null,
    },
    ages: {
      title: t("ages"),
      oldest: t("oldest", { year: data.ageExtremes.oldest?.year ?? 0 }),
      youngest: t("youngest", { year: data.ageExtremes.youngest?.year ?? 0 }),
      oldestUnit: t("ageUnit", { age: data.ageExtremes.oldest?.age ?? 0 }),
      youngestUnit: t("ageUnit", { age: data.ageExtremes.youngest?.age ?? 0 }),
      note: t("agesNote"),
    },
    recordEdition: {
      title: t("recordEdition", { year: data.recordEdition?.year ?? 0 }),
      unit: t("recordEditionUnit", {
        count: data.recordEdition?.count ?? 0,
        newcomers: data.recordEdition?.newcomers ?? 0,
        prs: data.recordEdition?.personalRecords ?? 0,
      }),
    },
    womenTile: {
      title: t("women"),
      value: percent(data.women.share),
      unit: t("womenUnit"),
      axis: [
        trend[0] ? `${trend[0].year}: ${percent(trend[0].share)}` : "",
        data.women.peak
          ? t("womenPeak", { year: data.women.peak.year, share: percent(data.women.peak.share) })
          : "",
        trend.at(-1) ? `${trend.at(-1)?.year}: ${percent(trend.at(-1)?.share ?? 0)}` : "",
      ],
    },
    clubs: { title: t("clubs") },
    together: {
      title: t("together"),
      value: number(data.together.hours),
      unit: t("togetherUnit"),
      note: t("togetherNote", {
        days: number(data.together.days),
        climb: number(data.together.climbKm),
        starts: number(data.starts),
        metres: COURSE_CLIMB_M,
      }),
    },
    moment: moment ? { title: t("moment"), ...moment } : null,
    footnote: t("footnote", { km: decimal(COURSE_KM), metres: COURSE_CLIMB_M }),
    gap,
    winsCount: (count) => t("winsCount", { count }),
    yearRange: (from, to) => `${from}–${to}`,
    number,
  };

  return (
    <McvvStatsOverview
      brand={home.raw("brand") as McvvHomepageContent["brand"]}
      nav={home.raw("nav") as McvvHomepageContent["nav"]}
      data={data}
      copy={copy}
      statsNav={{
        current: STATS_OVERVIEW_SLUG,
        ariaLabel: stats("navLabel"),
        items: [
          { slug: STATS_OVERVIEW_SLUG, label: t("nav") },
          ...STAT_SLUGS.map((item) => ({ slug: item, label: stats(`${item}.nav`) })),
        ],
      }}
    />
  );
}

export const dynamic = "force-dynamic";
