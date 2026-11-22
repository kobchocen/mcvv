import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvEntrantsTable, McvvPublicNavbar } from "@/components/organisms";
import { loadClubYearEntrants } from "@/lib/entries/club-entrants";
import { currentRaceYear, editionNumber } from "@/lib/entries/year";
import { Link, redirect, type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";

type PageProps = Readonly<{
  params: Promise<{ locale: string; slug: string }>;
}>;

/**
 * Public page of a club's entered runners in the current year (#352).
 * No payment or entry status: runners of one club may sit on different registrations.
 * A stale slug redirects to the canonical "<id>-<name>" form; unknown clubs and clubs
 * without a public entry this year 404.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale, slug } = await params;
  const locale = requestedLocale as Locale;
  const result = await loadClubYearEntrants(decodeURIComponent(slug), locale);
  const t = await getTranslations({ locale, namespace: "Entrants" });
  const raceYear = await currentRaceYear();
  if (result.status !== "ok") {
    return { title: t("title") };
  }
  return {
    title: t("clubMetaTitle", { club: result.clubName }),
    description: t("clubMetaDescription", { club: result.clubName, n: editionNumber(raceYear) }),
  };
}

export default async function ClubEntrantsPage({ params }: PageProps) {
  const { locale: requestedLocale, slug: rawSlug } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const slug = decodeURIComponent(rawSlug);

  const [result, raceYear, home, copy] = await Promise.all([
    loadClubYearEntrants(slug, locale),
    currentRaceYear(),
    getTranslations({ locale, namespace: "Home" }),
    getTranslations({ locale, namespace: "Entrants" }),
  ]);

  if (result.status === "redirect") {
    redirect({
      href: { pathname: "/prihlaseni-zavodnici/klub/[slug]", params: { slug: result.canonical } },
      locale,
    });
  }
  if (result.status !== "ok") {
    notFound();
  }

  const brand = home.raw("brand") as McvvHomepageContent["brand"];
  const nav = home.raw("nav") as McvvHomepageContent["nav"];
  const categorySummary = result.categories
    .map((group) => `${group.name} (${group.runners.length})`)
    .join(" · ");

  return (
    <main className="min-h-screen bg-race-deep text-foreground" data-testid="club-entrants-page">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/prihlaseni-zavodnici"
            className="mb-6 inline-block text-sm font-semibold text-race-accent hover:underline"
          >
            ← {copy("backToList")}
          </Link>
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {copy("eyebrow", { n: editionNumber(raceYear) })}
            </p>
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold text-foreground dark:text-white sm:text-5xl">
            {result.clubName}
          </h1>
          <p className="mt-4 text-base text-foreground dark:text-white">
            {copy("clubTotal", { count: result.total })}
          </p>
          {categorySummary ? (
            <p className="mt-2 text-sm text-race-muted">{categorySummary}</p>
          ) : null}
          <p className="mt-4">
            <Link
              href={{ pathname: "/kluby/[slug]", params: { slug: result.canonical } }}
              className="text-sm font-semibold text-race-accent hover:underline"
            >
              {copy("clubProfile")}
            </Link>
          </p>

          <div className="mt-12">
            <McvvEntrantsTable
              categories={result.categories}
              showClub={false}
              copy={{
                colName: copy("colName"),
                colBirth: copy("colBirth"),
                colClub: copy("colClub"),
                colStarts: copy("colStarts"),
                colRecord: copy("colRecord"),
                newbie: copy("newbie"),
                starts: (values) => copy("starts", values),
              }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
