import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvTeamRulesPage, type McvvHomepageContent } from "@/components/templates";
import { withFooterYear } from "@/components/templates/mcvv-homepage-content";
import { currentRaceYear, editionNumber } from "@/lib/entries/year";
import { getHomeResultsSummary } from "@/lib/home/cached";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Teams" });
  return { title: t("title") };
}

export default async function TeamRulesPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const home = await getTranslations({ locale, namespace: "Home" });
  const t = await getTranslations({ locale, namespace: "Teams" });
  const raceYear = await currentRaceYear();
  const n = editionNumber(raceYear);
  const summary = await getHomeResultsSummary();

  return (
    <McvvTeamRulesPage
      brand={home.raw("brand") as McvvHomepageContent["brand"]}
      nav={home.raw("nav") as McvvHomepageContent["nav"]}
      footer={withFooterYear(
        home.raw("footer") as McvvHomepageContent["footer"],
        summary?.year ?? null,
      )}
      copy={{
        eyebrow: t("rulesEyebrow", { n, when: t("when2026") }),
        title: t("title"),
        lead: t("lead", { n }),
        sectionTeam: t("sectionTeam"),
        teamDef: t("teamDef"),
        entryDuty: t("entryDuty"),
        noClub: t("noClub"),
        sectionScoring: t("sectionScoring"),
        scoringRules: t("scoringRules"),
        otherCats: t("otherCats"),
        mainCats: t("mainCats"),
        place: t("place"),
        points: t("points"),
        sum: t("sum"),
        sectionRanking: t("sectionRanking"),
        rankingRules: t("rankingRules"),
        sectionTie: t("sectionTie"),
        tieRules: t("tieRules"),
        sectionPrize: t("sectionPrize"),
        announcement: t("announcement"),
        prizeWaiver: t("prizeWaiver"),
        officialPublish: t("officialPublish"),
        sponsorLabel: t("sponsorLabel"),
        sponsorTitle: t("sponsorTitle"),
        sponsorWebsite: t("sponsorWebsite"),
        historyLink: t("historyLink"),
        historyLinkNote: t("historyLinkNote"),
      }}
    />
  );
}

export const dynamic = "force-dynamic";
