import { getTranslations, setRequestLocale } from "next-intl/server";

import { prisma } from "@/lib/db/client";
import { formatRaceTime, isPortraitImage } from "@/lib/utils";
import { McvvHomepageTemplate, type McvvHomepageContent } from "@/components/templates";
import { routing, type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function Home({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Home" });

  // Fetch random real photos from mcvv_fotky for the gallery.
  // Use only portrait photos from the last 3 years and display them in uniform 3:4 (preserve portrait AR).
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 2;
  const allPhotos = await prisma.photo.findMany({
    where: { image: { not: null }, year: { gte: minYear } },
    select: { id: true },
  });

  // Shuffle using Math.random is intentional for dynamic random gallery selection on each request (force-dynamic).
  const shuffled = allPhotos.length > 0 ? [...allPhotos].sort(() => 0.5 - Math.random()) : []; // eslint-disable-line react-hooks/purity

  // Sample candidates, load their blobs, keep only portrait ones.
  const CANDIDATES = 60;
  const candidateIds = shuffled.slice(0, CANDIDATES).map((p) => p.id);

  const withImages =
    candidateIds.length > 0
      ? await prisma.photo.findMany({
          where: { id: { in: candidateIds } },
          select: { id: true, image: true },
        })
      : [];
  const portraitIds = withImages
    .filter((p) => p.image && isPortraitImage(Buffer.from(p.image)))
    .map((p) => p.id)
    .slice(0, 20);

  // Fallback to any if not enough portrait photos (should be rare)
  const galleryPhotoIds =
    portraitIds.length >= 7
      ? [...portraitIds].sort(() => 0.5 - Math.random()).slice(0, 7) // eslint-disable-line react-hooks/purity
      : shuffled.slice(0, 7).map((p) => p.id);

  // Real results for "05 — Výsledky a historie" from mcvv_time.
  // Latest 3 years, absolute fastest by sex (M/F from categories), real participant count.
  // All links internal: /results and /results/[year]
  const rawResults = t.raw("results") as McvvHomepageContent["results"];
  const latestYearRows = await prisma.result.findMany({
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
    take: 3,
  });
  const yearNums = latestYearRows.map((y) => y.year);

  let dynamicYears = rawResults.years;
  if (yearNums.length > 0) {
    const isCs = locale === "cs";

    dynamicYears = await Promise.all(
      yearNums.map(async (year) => {
        const [count, topMen, topWomen] = await Promise.all([
          prisma.result.count({ where: { year } }),
          prisma.result.findFirst({
            where: { year, category: { sex: "M" } },
            orderBy: { time: "asc" },
            select: { runnerName: true, time: true },
          }),
          prisma.result.findFirst({
            where: { year, category: { sex: "F" } },
            orderBy: { time: "asc" },
            select: { runnerName: true, time: true },
          }),
        ]);

        const winners: { category: string; name: string; time: string }[] = [];

        if (topMen) {
          winners.push({
            category: isCs ? "Muži" : "Men",
            name: topMen.runnerName || "—",
            time: formatRaceTime(topMen.time),
          });
        }
        if (topWomen) {
          winners.push({
            category: isCs ? "Ženy" : "Women",
            name: topWomen.runnerName || "—",
            time: formatRaceTime(topWomen.time),
          });
        }
        if (winners.length === 0) {
          winners.push({ category: isCs ? "Nejlepší" : "Top", name: "—", time: "—" });
        }

        return {
          year: String(year),
          label: rawResults.years[0]?.label || (isCs ? "Ročník" : "Edition"),
          winners,
          linkLabel:
            rawResults.years[0]?.linkLabel ||
            (isCs ? "Zobrazit kompletní výsledky" : "View complete results"),
          href: `/results/${year}`,
          count,
        };
      }),
    );
  }

  const content: McvvHomepageContent = {
    brand: t.raw("brand") as McvvHomepageContent["brand"],
    nav: t.raw("nav") as McvvHomepageContent["nav"],
    hero: t.raw("hero") as McvvHomepageContent["hero"],
    overview: t.raw("overview") as McvvHomepageContent["overview"],
    profile: t.raw("profile") as McvvHomepageContent["profile"],
    schedule: t.raw("schedule") as McvvHomepageContent["schedule"],
    info: t.raw("info") as McvvHomepageContent["info"],
    results: {
      ...rawResults,
      years: dynamicYears,
    },
    gallery: t.raw("gallery") as McvvHomepageContent["gallery"],
    partners: t.raw("partners") as McvvHomepageContent["partners"],
    finalCta: t.raw("finalCta") as McvvHomepageContent["finalCta"],
    footer: t.raw("footer") as McvvHomepageContent["footer"],
  };

  return <McvvHomepageTemplate content={content} galleryPhotoIds={galleryPhotoIds} />;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export const dynamic = "force-dynamic";
