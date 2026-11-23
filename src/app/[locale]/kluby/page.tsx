import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvClubsHub, type McvvHomepageContent } from "@/components/templates";
import { redirect, type Locale } from "@/i18n/routing";
import { getClubInsights } from "@/lib/clubs/cached";
import { isClubListQuery } from "@/lib/clubs/insights";
import { intlTag } from "@/lib/i18n/locale";

type SearchParams = {
  q?: string | string[];
  razeni?: string | string[];
  strana?: string | string[];
};

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Clubs" });
  return { title: t("hubMetaTitle"), description: t("hubIntro") };
}

/**
 * Club insights hub. Legacy list URLs (`q`, `razeni`, `strana`) redirect to /kluby/seznam.
 */
export default async function ClubsHubPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const query = await searchParams;
  const q = first(query.q).trim().slice(0, 80);
  const razeni = first(query.razeni);
  const strana = first(query.strana);
  if (isClubListQuery({ q, razeni, strana })) {
    const next: Record<string, string> = {};
    if (q) next.q = q;
    if (razeni) next.razeni = razeni;
    if (strana) next.strana = strana;
    redirect({ href: { pathname: "/kluby/seznam", query: next }, locale });
  }

  const [home, t, data] = await Promise.all([
    getTranslations({ locale, namespace: "Home" }),
    getTranslations({ locale, namespace: "Clubs" }),
    getClubInsights(),
  ]);
  const number = (value: number) => new Intl.NumberFormat(intlTag(locale)).format(value);
  const perfect = data.streaks.filter((row) => row.length === data.editions);
  const topStreak = data.streaks[0];

  return (
    <McvvClubsHub
      brand={home.raw("brand") as McvvHomepageContent["brand"]}
      nav={home.raw("nav") as McvvHomepageContent["nav"]}
      data={data}
      copy={{
        eyebrow: t("eyebrow"),
        title: t("title"),
        intro: t("hubIntro"),
        lead: t("hubLead", {
          clubs: data.clubs,
          editions: data.editions,
          starts: number(data.finishers - data.unlinkedStarts),
        }),
        unlinkedNote: t("unlinkedNote", { count: data.unlinkedStarts }),
        navLabel: t("navLabel"),
        toList: t("toList"),
        men: t("men"),
        women: t("women"),
        wins: t("wins"),
        podiums: t("podiums"),
        empty: t("emptyView"),
        medalsNote: t("medalsNote"),
        startListNote: t("startListNote"),
        streaksTitle: t("streaksTitle"),
        streaksLead: t("streaksLead"),
        streaksCol: t("streaksCol"),
        editions: t("editions"),
        starts: t("starts"),
        years: t("years"),
        loyalTitle: t("loyalTitle"),
        loyalLead: t("loyalLead"),
        loyalMissed: t("loyalMissed"),
        expeditionsTitle: t("expeditionsTitle"),
        expeditionsLead: t("expeditionsLead"),
        expeditionsMax: t("expeditionsMax"),
        expeditionsAll: t("expeditionsAll"),
        colYear: t("colYear"),
        colSize: t("colSize"),
        newcomersTitle: t("newcomersTitle"),
        newcomersLead: t("newcomersLead", {
          year: data.newcomersLatestYear,
          newcomers: data.newcomersLatestCount,
          returns: data.returns.length,
        }),
        newcomersHeading: t("newcomersHeading", { year: data.newcomersLatestYear }),
        returnsHeading: t("returnsHeading", { year: data.newcomersLatestYear }),
        returnsGap: t("returnsGap"),
        returnsLast: t("returnsLast"),
        yearsCount: (count) => t("yearsCount", { count }),
        medalsTitle: t("medalsTitle"),
        medalsLead: t("medalsLead"),
        smallTitle: t("smallTitle"),
        smallLead: t("smallLead"),
        winRate: t("winRate"),
        podiumRate: t("podiumRate"),
        veteransTitle: t("veteransTitle"),
        veteransLead: t("veteransLead", { threshold: data.veteranThreshold }),
        veteransCount: t("veteransCount"),
        veteransExamples: t("veteransExamples"),
        veteransAll: t("veteransAll"),
        jubileesTitle: t("jubileesTitle", { year: data.nextYear }),
        jubileeNth: (n) => t("jubileeNth", { n }),
        counters: [
          { value: number(data.clubs), label: t("counterClubs") },
          {
            value: number(data.editions),
            label: t("counterEditions"),
            sub: data.firstYear && data.lastYear ? `${data.firstYear}–${data.lastYear}` : undefined,
          },
          { value: number(data.finishers - data.unlinkedStarts), label: t("counterStarts") },
          {
            value: topStreak ? String(topStreak.length) : "—",
            label: t("viewStreaks"),
            sub: perfect.length
              ? perfect.map((row) => row.name).join(" · ")
              : topStreak
                ? `${topStreak.name} (${topStreak.from}–${topStreak.to})`
                : undefined,
          },
        ],
        t: (key, values) => t(key, values),
      }}
    />
  );
}

export const dynamic = "force-dynamic";
