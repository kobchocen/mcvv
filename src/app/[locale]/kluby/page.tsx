import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvClubsHub, type McvvHomepageContent } from "@/components/templates";
import { redirect, type Locale } from "@/i18n/routing";
import { getClubDirectory, getClubInsights } from "@/lib/clubs/cached";
import { isClubListQuery, isClubListView, parseClubHubView } from "@/lib/clubs/insights";
import { intlTag } from "@/lib/i18n/locale";

type SearchParams = {
  q?: string | string[];
  razeni?: string | string[];
  strana?: string | string[];
  smer?: string | string[];
  pohled?: string | string[];
};

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Clubs" });
  const pohled = first((await searchParams).pohled);
  const view = parseClubHubView(pohled);
  const viewLabel =
    view === "snury"
      ? t("viewStreaks")
      : view === "vernost"
        ? t("viewLoyal")
        : view === "vypravy"
          ? t("viewExpeditions")
          : view === "novacci"
            ? t("viewNewcomers")
            : view === "medaile"
              ? t("viewMedals")
              : view === "male-kluby"
                ? t("viewSmall")
                : view === "veterani"
                  ? t("viewVeterans")
                  : view === "jubilea"
                    ? t("viewJubilees")
                    : null;
  return {
    title: viewLabel ? t("hubViewMetaTitle", { view: viewLabel }) : t("hubMetaTitle"),
    description: t("hubIntro"),
  };
}

/**
 * Club insights hub. Legacy list URLs (`q`, `razeni`, `strana`) and ?pohled=seznam
 * redirect to /kluby/seznam. Other `pohled` values open a single view tab.
 */
export default async function ClubsHubPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const query = await searchParams;
  const q = first(query.q).trim().slice(0, 80);
  const razeni = first(query.razeni);
  const strana = first(query.strana);
  const smer = first(query.smer);
  const pohled = first(query.pohled);
  if (isClubListQuery({ q, razeni, strana, smer }) || isClubListView(pohled)) {
    const next: Record<string, string> = {};
    if (q) next.q = q;
    if (razeni) next.razeni = razeni;
    if (strana) next.strana = strana;
    if (smer) next.smer = smer;
    redirect({ href: { pathname: "/kluby/seznam", query: next }, locale });
  }

  const view = parseClubHubView(pohled);
  const [home, t, data, directory] = await Promise.all([
    getTranslations({ locale, namespace: "Home" }),
    getTranslations({ locale, namespace: "Clubs" }),
    getClubInsights(),
    getClubDirectory(),
  ]);
  const number = (value: number) => new Intl.NumberFormat(intlTag(locale)).format(value);
  const perfect = data.streaks.filter((row) => row.length === data.editions);
  const topStreak = data.streaks[0];

  return (
    <McvvClubsHub
      brand={home.raw("brand") as McvvHomepageContent["brand"]}
      nav={home.raw("nav") as McvvHomepageContent["nav"]}
      data={data}
      view={view}
      suggestNames={directory.map((row) => row.name)}
      listAction={`/${locale}/kluby/seznam`}
      copy={{
        eyebrow: t("eyebrow"),
        title: t("title"),
        intro: t("hubIntro"),
        lead:
          data.unlinkedStarts > 0
            ? t("hubLeadUnlinked", {
                clubs: data.clubs,
                editions: data.editions,
                starts: number(data.finishers - data.unlinkedStarts),
                unlinked: data.unlinkedStarts,
              })
            : t("hubLead", {
                clubs: data.clubs,
                editions: data.editions,
                starts: number(data.finishers - data.unlinkedStarts),
              }),
        navLabel: t("navLabel"),
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
        expeditionsUnit: t("expeditionsUnit"),
        expeditionsChart: t("expeditionsChart"),
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
        cardReturn: (club, gap) =>
          t("cardReturn", { club, gap: t("cardReturnGap", { count: gap }) }),
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
        veteransUnit: t("veteransUnit"),
        jubileesTitle: t("jubileesTitle", { year: data.nextYear }),
        jubileeNth: (n) => t("jubileeNth", { n }),
        moreView: t("moreView"),
        moreList: t("moreList"),
        showMoreCount: (count) => t("showMoreCount", { count }),
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
