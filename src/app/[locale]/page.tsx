import { getTranslations, setRequestLocale } from "next-intl/server";

import { currentRaceYear } from "@/lib/entries/year";
import { formatRaceDay } from "@/lib/format/date";
import { getHomeResultsSummary } from "@/lib/home/cached";
import { loadPartners } from "@/lib/partners/logos";
import { fillPlaceholders, startTextParams } from "@/lib/race/start-text";
import { pickGalleryPhotoIds } from "@/lib/photos/gallery";
import { getHomepagePhotoCandidates } from "@/lib/photos/queries";
import { formatRaceTime } from "@/lib/utils";
import {
  McvvHomepageTemplate,
  type McvvHomepageContent,
  withFooterYear,
} from "@/components/templates";
import { routing, type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function Home({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Home" });
  const stats = await getTranslations({ locale, namespace: "Stats" });

  // Random portrait photos from the last 3 years. Candidate list (ids + stored
  // dimensions) is cached for ~10 min and served by index (rok, has_image); no blob reads.
  const minYear = new Date().getFullYear() - 2;
  const candidates = await getHomepagePhotoCandidates(minYear);
  const galleryPhotoIds = pickGalleryPhotoIds(candidates, 7);

  const rawResults = t.raw("results") as McvvHomepageContent["results"];
  // Cached (DB load on race day): latest results year, its count and the overall winners change only
  // with a result import or a runner/club fix, all of which revalidate the "stats" tag.
  const summary = await getHomeResultsSummary();
  const latestYear = summary?.year ?? null;

  let dynamicYears: McvvHomepageContent["results"]["years"] = [];
  if (summary) {
    const { count, men: topMen, women: topWomen } = summary;
    const winners: { category: string; name: string; time: string; runnerId?: string }[] = [];
    if (topMen) {
      winners.push({
        category: stats("men"),
        name: topMen.name || "—",
        time: formatRaceTime(topMen.time),
        runnerId: topMen.runnerId,
      });
    }
    if (topWomen) {
      winners.push({
        category: stats("women"),
        name: topWomen.name || "—",
        time: formatRaceTime(topWomen.time),
        runnerId: topWomen.runnerId,
      });
    }

    dynamicYears = [
      {
        year: String(latestYear),
        overline: rawResults.overline,
        label: rawResults.yearLabel,
        winners,
        linkLabel: rawResults.linkLabel,
        href: `/results/${summary.year}`,
        count,
      },
    ];
  }

  const { raceDate, startModel, slotSettings } = await currentRaceYear();
  // Čas startu a interval v textech z modelu ročníku (st_nula_s, st_interval), ne natvrdo.
  const startText = startTextParams(startModel, slotSettings);
  const rawSchedule = {
    ...fillPlaceholders(t.raw("schedule") as McvvHomepageContent["schedule"], startText),
    zeroSeconds: startModel.zeroSeconds,
  };
  const schedule: McvvHomepageContent["schedule"] = raceDate
    ? { ...rawSchedule, title: formatRaceDay(raceDate, locale) }
    : rawSchedule;

  const content: McvvHomepageContent = {
    brand: t.raw("brand") as McvvHomepageContent["brand"],
    nav: t.raw("nav") as McvvHomepageContent["nav"],
    hero: t.raw("hero") as McvvHomepageContent["hero"],
    overview: fillPlaceholders(t.raw("overview") as McvvHomepageContent["overview"], startText),
    profile: t.raw("profile") as McvvHomepageContent["profile"],
    schedule,
    results: {
      ...rawResults,
      years: dynamicYears,
    },
    gallery: t.raw("gallery") as McvvHomepageContent["gallery"],
    partners: {
      ...(t.raw("partners") as McvvHomepageContent["partners"]),
      items: await loadPartners(),
    },
    finalCta: t.raw("finalCta") as McvvHomepageContent["finalCta"],
    footer: withFooterYear(t.raw("footer") as McvvHomepageContent["footer"], latestYear),
    backToTop: t("backToTop"),
  };

  return (
    <McvvHomepageTemplate content={content} galleryPhotoIds={galleryPhotoIds} locale={locale} />
  );
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export const dynamic = "force-dynamic";
