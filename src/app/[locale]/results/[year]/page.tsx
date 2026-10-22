import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import NextLink from "next/link";

import { getClubResolver } from "@/lib/clubs/queries";
import { runnerNameFor } from "@/lib/format/runner-name";
import { prisma } from "@/lib/db/client";
import { HighlightHashedRow } from "@/components/molecules";
import { McvvFooter, McvvPublicNavbar } from "@/components/organisms";
import {
  McvvResultsGroup,
  type McvvResultsTableLabels,
} from "@/components/organisms/mcvv-results-table";
import { type McvvHomepageContent, withFooterYear } from "@/components/templates";
import { DownloadResultsButton } from "@/components/results/DownloadResultsButton";
import type { Locale } from "@/i18n/routing";
import type { Prisma } from "@prisma/client";

type PageProps = {
  params: Promise<{ locale: string; year: string }>;
};

type ResultWithRels = Prisma.ResultGetPayload<{
  include: {
    category: { select: { name: true; sex: true } };
    club: { select: { name: true } };
  };
}>;

type ResultRow = ResultWithRels & {
  _clubName: string;
  _clubSlug: string | null;
  _birthYear: string;
  _catRank?: number;
};

export default async function ResultsYearPage({ params }: PageProps) {
  const { locale: requestedLocale, year: yearParam } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const year = parseInt(yearParam, 10);
  if (isNaN(year)) notFound();

  // Check year exists
  const hasData = await prisma.result.count({ where: { year } });
  if (hasData === 0) notFound();

  // Full results for the year
  const rawResults = await prisma.result.findMany({
    where: { year },
    orderBy: { time: "asc" },
    include: {
      category: {
        select: { name: true, sex: true },
      },
      club: {
        select: { name: true },
      },
      runner: { select: { name: true } },
    },
  });

  // Canonical club once merged in the admin (#104), else the name as written.
  const clubs = await getClubResolver();
  const results: ResultRow[] = rawResults.map(({ runner, ...r }) => ({
    ...r,
    runnerName: runnerNameFor("results", r.runnerName, runner?.name),
    _clubName: clubs.display(r.club?.name || r.clubName),
    _clubSlug: clubs.resolve(r.club?.name || r.clubName)?.slug ?? null,
    _birthYear: r.runnerId ? r.runnerId.substring(0, 4) : "—",
  })) as ResultRow[];

  const total = results.length;

  // Edition info (weather, temp)
  const editionInfo = await prisma.edition.findFirst({
    where: {
      date: {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1),
      },
    },
    select: {
      date: true,
      weather: true,
      temp: true,
    },
  });

  // Compute category ranks (1-based within category, ties share rank)
  const catGroups: Record<string, ResultRow[]> = {};
  results.forEach((r) => {
    const key = r.categoryId;
    if (!catGroups[key]) catGroups[key] = [];
    catGroups[key].push(r);
  });
  Object.values(catGroups).forEach((group) => {
    group.sort((a, b) => a.time - b.time);
    let rank = 1;
    for (let i = 0; i < group.length; i++) {
      if (i > 0 && group[i].time !== group[i - 1].time) {
        rank = i + 1;
      }
      group[i]._catRank = rank;
    }
  });

  // Ordered categories
  const allCats = await prisma.category.findMany({ orderBy: { sort: "asc" } });
  const usedCatIds = new Set(results.map((r) => r.categoryId));
  const orderedCats = allCats.filter((c) => usedCatIds.has(c.id));

  const isCs = locale === "cs";
  const title = isCs ? `Výsledky ročníku ${year}` : `Results ${year}`;
  const subtitle = isCs ? `${total} účastníků` : `${total} participants`;

  const home = await getTranslations({ locale, namespace: "Home" });
  const t = await getTranslations({ locale, namespace: "ResultsArchive" });
  const labels: McvvResultsTableLabels = {
    name: t("colName"),
    birth: t("colBirth"),
    birthShort: t("colBirthShort"),
    club: t("colClub"),
    category: t("colCategory"),
    split1: t("colSplit1"),
    split2: t("colSplit2"),
    split1Short: t("split1Short"),
    split2Short: t("split2Short"),
    time: t("colTime"),
    empty: t("empty"),
  };
  const brand = home.raw("brand") as McvvHomepageContent["brand"];
  const nav = home.raw("nav") as McvvHomepageContent["nav"];
  const footer = withFooterYear(home.raw("footer") as McvvHomepageContent["footer"], year);

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <HighlightHashedRow />
      <div className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[2px] text-race-accent">
                {isCs ? "05 — Výsledky a historie" : "05 — Results and history"}
              </p>
              <h1 className="mt-2 font-display text-5xl font-bold">{title}</h1>
              <p className="mt-1 text-lg text-race-muted">{subtitle}</p>
              {editionInfo && (
                <>
                  {editionInfo.date && (
                    <p className="mt-1 text-sm text-race-muted">
                      Datum:{" "}
                      {new Date(editionInfo.date).toLocaleDateString("cs-CZ", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-race-muted">
                    Počasí: {editionInfo.weather || "—"}, {editionInfo.temp ?? "—"} °C
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-3">
              <DownloadResultsButton
                year={year}
                total={total}
                editionInfo={editionInfo}
                orderedCats={orderedCats}
                catGroups={catGroups}
              />
              <NextLink
                href={`/${locale}/results`}
                className="inline-flex items-center rounded-md border border-race-line/60 px-4 py-2 text-sm font-semibold hover:bg-race-forest"
              >
                {isCs ? "Přehled ročníků" : "All years"}
              </NextLink>
              <NextLink
                href={`/${locale}/statistiky`}
                className="inline-flex items-center rounded-md border border-race-line/60 px-4 py-2 text-sm font-semibold hover:bg-race-forest"
              >
                {t("stats")}
              </NextLink>
              <NextLink
                href={`/${locale}/`}
                className="inline-flex items-center rounded-md border border-race-line/60 px-4 py-2 text-sm font-semibold hover:bg-race-forest"
              >
                ← {isCs ? "Domů" : "Home"}
              </NextLink>
            </div>
          </div>

          {/* Category navigation buttons */}
          <div className="mb-3 flex flex-wrap gap-1">
            {orderedCats.map((cat) => (
              <a
                key={cat.id}
                href={`#cat-${cat.id}`}
                className="rounded border border-race-line/50 px-2 py-0.5 text-xs transition hover:bg-race-forest hover:border-race-accent"
              >
                {cat.name}
              </a>
            ))}
          </div>

          {/* Results display - always by categories */}
          <div className="overflow-hidden rounded-lg border border-race-line/50 bg-race-surface">
            {orderedCats.map((cat) => {
              const group = (catGroups[cat.id] || []).sort((a, b) => a.time - b.time);
              if (group.length === 0) return null;
              return (
                <McvvResultsGroup
                  id={`cat-${cat.id}`}
                  key={cat.id}
                  className="mb-6 last:mb-0"
                  title={`${cat.name} (${group.length})`}
                  anchorRows
                  desktopLeading="normal"
                  labels={labels}
                  rows={group.map((r) => ({
                    key: `${r.year}-${r.runnerId}`,
                    runnerId: r.runnerId,
                    runnerName: r.runnerName,
                    rank: r._catRank,
                    birthYear: r._birthYear,
                    club: r._clubName,
                    clubSlug: r._clubSlug,
                    split1: null,
                    split2: null,
                    time: r.time,
                  }))}
                />
              );
            })}
          </div>

          {/* Floating back to top */}
          <a
            href="#"
            className="fixed bottom-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-race-accent-solid text-white shadow-lg transition hover:bg-race-accent-solid-hover"
            aria-label="Nahoru"
          >
            ↑
          </a>
        </div>
      </div>
      <McvvFooter content={{ brand, footer }} />
    </main>
  );
}

export function generateStaticParams() {
  // Will be dynamic in practice, but can pre-render recent years if wanted.
  // For now dynamic.
  return [];
}

export const dynamic = "force-dynamic";
