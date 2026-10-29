import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvPlaceholderPage, type McvvHomepageContent } from "@/components/templates";
import { withOnlineResultsLink } from "@/components/templates/mcvv-homepage-template";
import { prisma } from "@/lib/db/client";
import { currentRaceYear, editionNumber } from "@/lib/entries/year";
import { getOfeedSettings, onlineResultsOverrideUrl } from "@/lib/ofeed/settings";
import { raceStartFor, resolveHeroPhase } from "@/lib/race/phase";
import { getSiteSettings } from "@/lib/settings/site";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({
    locale: requestedLocale as Locale,
    namespace: "ResultsCurrent",
  });
  return { title: t("title") };
}

/**
 * Results of the current race year: redirects to /results/{year} once results exist,
 * otherwise an empty state with a link to the results archive.
 */
export default async function CurrentResultsPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const raceYear = await currentRaceYear();
  const count = await prisma.result.count({ where: { year: raceYear.year } });
  if (count > 0) {
    redirect(`/${locale}/results/${raceYear.year}`);
  }

  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "ResultsCurrent" });
  const brand = home.raw("brand") as McvvHomepageContent["brand"];
  let nav = home.raw("nav") as McvvHomepageContent["nav"];

  // V den závodu (od startu do zveřejnění výsledků) banner na online výsledky (Q116).
  const raceDay =
    resolveHeroPhase({
      now: new Date(),
      raceStart: raceStartFor(raceYear.raceDate, raceYear.year),
      startlistPublished: true,
      resultsCount: count,
    }) === "C";
  let banner = null;
  if (raceDay) {
    const [site, ofeed] = await Promise.all([
      getSiteSettings(),
      getOfeedSettings().catch(() => null),
    ]);
    const override = onlineResultsOverrideUrl(site.onlineResultsUrl, ofeed);
    const label = home("hero.onlineResultsCta");
    nav = withOnlineResultsLink(nav, label);
    banner = {
      title: copy("liveTitle"),
      text: copy("liveText"),
      label,
      href: override ?? "/vysledky/online",
      external: override !== null,
    };
  }

  return (
    <McvvPlaceholderPage
      brand={brand}
      nav={nav}
      banner={banner}
      eyebrow={copy("eyebrow", { n: editionNumber(raceYear) })}
      title={copy("title")}
      status={copy("status")}
      link={{ label: copy("archive"), href: "/results" }}
    />
  );
}

export const dynamic = "force-dynamic";
