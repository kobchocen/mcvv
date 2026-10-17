import { getTranslations, setRequestLocale } from "next-intl/server";

import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { displayRunnerName } from "@/lib/format/runner-name";
import { formatRaceDay } from "@/lib/format/date";
import { loadPartners } from "@/lib/partners/logos";
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

  // Random portrait photos from the last 3 years. Candidate list (ids + stored
  // dimensions) is cached for ~10 min and served by index (rok, has_image); no blob reads.
  const minYear = new Date().getFullYear() - 2;
  const candidates = await getHomepagePhotoCandidates(minYear);
  const galleryPhotoIds = pickGalleryPhotoIds(candidates, 7);

  const rawResults = t.raw("results") as McvvHomepageContent["results"];
  const isCs = locale === "cs";
  const latestYearRow = await prisma.result.findFirst({
    orderBy: { year: "desc" },
    select: { year: true },
  });
  const latestYear = latestYearRow?.year ?? null;

  let dynamicYears: McvvHomepageContent["results"]["years"] = [];
  if (latestYear) {
    const [count, topMen, topWomen] = await Promise.all([
      prisma.result.count({ where: { year: latestYear } }),
      prisma.result.findFirst({
        where: { year: latestYear, categoryId: "A" },
        orderBy: { time: "asc" },
        select: {
          runnerName: true,
          time: true,
          runnerId: true,
          runner: { select: { name: true } },
        },
      }),
      prisma.result.findFirst({
        where: { year: latestYear, categoryId: "F" },
        orderBy: { time: "asc" },
        select: {
          runnerName: true,
          time: true,
          runnerId: true,
          runner: { select: { name: true } },
        },
      }),
    ]);

    const winners: { category: string; name: string; time: string; runnerId?: string }[] = [];
    if (topMen) {
      winners.push({
        category: isCs ? "Muži" : "Men",
        name: displayRunnerName(topMen.runnerName, topMen.runner?.name) || "—",
        time: formatRaceTime(topMen.time),
        runnerId: topMen.runnerId,
      });
    }
    if (topWomen) {
      winners.push({
        category: isCs ? "Ženy" : "Women",
        name: displayRunnerName(topWomen.runnerName, topWomen.runner?.name) || "—",
        time: formatRaceTime(topWomen.time),
        runnerId: topWomen.runnerId,
      });
    }

    dynamicYears = [
      {
        year: String(latestYear),
        label: rawResults.yearLabel,
        winners,
        linkLabel: rawResults.linkLabel,
        href: `/results/${latestYear}`,
        count,
      },
    ];
  }

  const { raceDate } = await currentRaceYear();
  const rawSchedule = t.raw("schedule") as McvvHomepageContent["schedule"];
  const schedule: McvvHomepageContent["schedule"] = raceDate
    ? { ...rawSchedule, title: formatRaceDay(raceDate, locale) }
    : rawSchedule;

  const content: McvvHomepageContent = {
    brand: t.raw("brand") as McvvHomepageContent["brand"],
    nav: t.raw("nav") as McvvHomepageContent["nav"],
    hero: t.raw("hero") as McvvHomepageContent["hero"],
    overview: t.raw("overview") as McvvHomepageContent["overview"],
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

  return <McvvHomepageTemplate content={content} galleryPhotoIds={galleryPhotoIds} />;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export const dynamic = "force-dynamic";
