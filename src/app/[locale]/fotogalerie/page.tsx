import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PhotoGalleryGrid } from "@/components/molecules";
import { McvvPublicNavbar } from "@/components/organisms";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db/client";
import { photoCaption } from "@/lib/photos/caption";
import { cn } from "@/lib/utils";
import type { McvvHomepageContent } from "@/components/templates";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "PhotoGallery" });
  return { title: t("title") };
}

export default async function PhotoGalleryPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const { year: yearParam } = await searchParams;
  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "PhotoGallery" });

  const yearRows = await prisma.photo.groupBy({
    by: ["year"],
    where: { image: { not: null } },
    _count: { id: true },
    orderBy: { year: "desc" },
  });
  const years = yearRows.map((row) => row.year);
  const requested = yearParam ? Number(yearParam) : null;
  const selectedYear = requested && years.includes(requested) ? requested : (years[0] ?? null);

  const photos =
    selectedYear === null
      ? []
      : await prisma.photo.findMany({
          where: { year: selectedYear, image: { not: null } },
          select: {
            id: true,
            year: true,
            debugText: true,
            location: { select: { desc: true } },
            runners: {
              select: { runner: { select: { name: true } } },
              orderBy: { orderFromLeft: "asc" },
            },
          },
          orderBy: { id: "asc" },
        });
  const gallery = photos.map((photo) => {
    const caption = photoCaption({
      year: photo.year,
      description: photo.debugText,
      place: photo.location.desc,
      people: photo.runners.map((row) => row.runner.name),
    });
    return {
      id: photo.id,
      caption,
      alt: caption || copy("photoAlt", { year: selectedYear ?? "" }),
    };
  });

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar
        content={{
          brand: home.raw("brand") as McvvHomepageContent["brand"],
          nav: home.raw("nav") as McvvHomepageContent["nav"],
        }}
        variant="solid"
      />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {copy("eyebrow")}
            </p>
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold text-white sm:text-5xl">
            {copy("title")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-race-muted">{copy("intro")}</p>

          {years.length === 0 ? (
            <p className="mt-10 text-sm text-race-muted">{copy("empty")}</p>
          ) : (
            <>
              <div className="mt-8 flex flex-wrap gap-2">
                {years.map((year) => (
                  <Link
                    key={year}
                    href={`/fotogalerie?year=${year}` as never}
                    className={cn(
                      "border px-3 py-1.5 text-sm font-semibold",
                      year === selectedYear
                        ? "border-race-accent bg-race-accent text-white"
                        : "border-race-line/60 text-race-muted hover:border-race-accent hover:text-white",
                    )}
                  >
                    {year}
                  </Link>
                ))}
              </div>

              <p className="mt-6 text-sm text-race-dim">
                {copy("count", { count: photos.length, year: selectedYear ?? "" })}
              </p>

              <PhotoGalleryGrid
                photos={gallery}
                loadMoreLabel={copy("loadMore")}
                closeLabel={copy("close")}
              />
            </>
          )}

          <p className="mt-10">
            <Link
              href="/"
              className="font-medium text-race-accent underline-offset-2 hover:underline"
            >
              {copy("back")}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
