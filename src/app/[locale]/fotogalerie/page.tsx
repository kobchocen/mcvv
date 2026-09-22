import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvNavbar } from "@/components/organisms";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db/client";
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
          select: { id: true, originalFilename: true },
          orderBy: { id: "asc" },
        });

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvNavbar
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

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="relative aspect-[3/4] overflow-hidden border border-race-line/60 bg-race-forest"
                  >
                    <Image
                      src={`/api/fotka?id=${photo.id}`}
                      alt={photo.originalFilename || copy("photoAlt", { year: selectedYear ?? "" })}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
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
