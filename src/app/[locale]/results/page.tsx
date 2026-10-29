import { getTranslations, setRequestLocale } from "next-intl/server";
import NextLink from "next/link";

import { RunnerNameLink } from "@/components/molecules";
import { loadNationalityMap } from "@/lib/runner/nationality-query";
import { McvvFooter, McvvPublicNavbar } from "@/components/organisms";
import {
  McvvResultsGroup,
  type McvvResultsTableLabels,
} from "@/components/organisms/mcvv-results-table";
import { pickSplits, yearHasSplits } from "@/lib/results/table";
import { type McvvHomepageContent, withFooterYear } from "@/components/templates";
import { getClubIndex } from "@/lib/clubs/cached";
import { createClubResolver } from "@/lib/clubs/core";
import { getResultYearCounts } from "@/lib/results/cached";
import { runnerNameFor } from "@/lib/format/runner-name";
import { prisma } from "@/lib/db/client";
import { formatRaceTime } from "@/lib/utils";
import type { Locale } from "@/i18n/routing";
import type { Prisma } from "@prisma/client";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ year?: string; view?: string; splits?: string }>;
};

type ResultWithRels = Prisma.ResultGetPayload<{
  include: {
    category: { select: { name: true; sex: true } };
    club: { select: { name: true } };
  };
}>;

type ResultRow = ResultWithRels & {
  _clubName?: string;
  _birthYear?: string;
  _catRank?: number;
  _absRank?: number;
  _splits?: Array<{ split: string; time: number }>;
};

export default async function ResultsArchivePage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const sp = await searchParams;
  const selectedYearParam = sp?.year ? parseInt(sp.year, 10) : null;
  const view = sp?.view === "absolute" ? "absolute" : "categories";
  const splitsRequested = sp?.splits === "true";

  const isCs = locale === "cs";

  // All years with participant counts + basic top info for summary cards
  const yearData = await getResultYearCounts();

  const years = yearData.map((y) => y.year);
  const countMap = Object.fromEntries(yearData.map((y) => [y.year, y.count]));

  // Default to latest or selected
  const defaultYear =
    selectedYearParam && years.includes(selectedYearParam)
      ? selectedYearParam
      : (years[0] ?? new Date().getFullYear());

  // Fetch top male + female for the default year (for summary)
  const [topMaleRaw, topFemaleRaw] = await Promise.all([
    prisma.result.findFirst({
      where: { year: defaultYear, category: { sex: "M" } },
      orderBy: { time: "asc" },
      select: {
        runnerName: true,
        time: true,
        categoryId: true,
        runnerId: true,
        runner: { select: { name: true } },
      },
    }),
    prisma.result.findFirst({
      where: { year: defaultYear, category: { sex: "F" } },
      orderBy: { time: "asc" },
      select: {
        runnerName: true,
        time: true,
        categoryId: true,
        runnerId: true,
        runner: { select: { name: true } },
      },
    }),
  ]);
  const topMale = withDisplayName(topMaleRaw);
  const topFemale = withDisplayName(topFemaleRaw);

  const fullResultsRaw = await prisma.result.findMany({
    where: { year: defaultYear },
    orderBy: { time: "asc" },
    include: {
      category: { select: { name: true, sex: true } },
      club: { select: { name: true } },
      runner: { select: { name: true } },
    },
  });

  const fullResults: ResultRow[] = fullResultsRaw.map(({ runner, ...r }) => ({
    ...r,
    runnerName: runnerNameFor("results", r.runnerName, runner?.name),
    _splits: [],
  })) as ResultRow[];

  const total = countMap[defaultYear] || fullResults.length;

  // Edition info for the selected year (date + weather)
  const editionInfo = await prisma.edition.findFirst({
    where: {
      date: {
        gte: new Date(defaultYear, 0, 1),
        lt: new Date(defaultYear + 1, 0, 1),
      },
    },
    select: { date: true, weather: true, temp: true },
  });

  // Bibs and splits for mezičasy support (like in per-year)
  const startEntries = await prisma.startEntry.findMany({
    where: { year: defaultYear },
    select: { runnerId: true, bib: true },
  });
  const bibByRunner = new Map(startEntries.map((s) => [s.runnerId, s.bib]));

  const splitsRaw = await prisma.split.findMany({
    where: { year: defaultYear },
    select: { bib: true, split: true, time: true },
  });
  const hasSplits = yearHasSplits(splitsRaw.length);
  const showSplits = splitsRequested && hasSplits;
  const splitsByBib = new Map<number, Array<{ split: string; time: number }>>();
  splitsRaw.forEach((s) => {
    if (s.split === "9") return;
    if (!splitsByBib.has(s.bib)) splitsByBib.set(s.bib, []);
    splitsByBib.get(s.bib)!.push({ split: s.split, time: s.time });
  });

  // Attach to results for splits
  fullResults.forEach((r) => {
    const bib = bibByRunner.get(r.runnerId);
    r._splits = bib ? splitsByBib.get(bib) || [] : [];
  });

  // Fetch categories for this year ordered by their defined sort order (not name)
  const usedCatIds = Array.from(new Set(fullResults.map((r) => r.categoryId)));
  const orderedCategories = await prisma.category.findMany({
    where: { id: { in: usedCatIds } },
    orderBy: { sort: "asc" },
  });

  // Category groups keyed by category id
  const catGroupsArch: Record<string, ResultRow[]> = {};
  fullResults.forEach((r) => {
    const key = r.categoryId;
    if (!catGroupsArch[key]) catGroupsArch[key] = [];
    catGroupsArch[key].push(r);
  });
  const catWinners = orderedCategories
    .map((cat) => {
      const list = catGroupsArch[cat.id] || [];
      if (list.length === 0) return null;
      const top = [...list].sort((a, b) => a.time - b.time)[0];
      return {
        id: cat.id,
        category: cat.name,
        name: top.runnerName || "—",
        runnerId: top.runnerId,
        time: formatRaceTime(top.time),
      };
    })
    .filter(
      (w): w is { id: string; category: string; name: string; runnerId: string; time: string } =>
        w !== null,
    );

  // assign ranks with ties per cat for display
  Object.values(catGroupsArch).forEach((group) => {
    group.sort((a, b) => a.time - b.time);
    let rank = 1;
    for (let i = 0; i < group.length; i++) {
      if (i > 0 && group[i].time !== group[i - 1].time) {
        rank = i + 1;
      }
      group[i]._catRank = rank;
    }
  });

  // Precompute absolute groups (by sex) with ranks so absolute view never disappears
  const absMen = fullResults.filter((r) => r.category?.sex === "M").sort((a, b) => a.time - b.time);
  const absWomen = fullResults
    .filter((r) => r.category?.sex === "F")
    .sort((a, b) => a.time - b.time);

  let mRank = 1;
  absMen.forEach((r, i) => {
    if (i > 0 && r.time !== absMen[i - 1].time) mRank = i + 1;
    r._absRank = mRank;
  });

  let wRank = 1;
  absWomen.forEach((r, i) => {
    if (i > 0 && r.time !== absWomen[i - 1].time) wRank = i + 1;
    r._absRank = wRank;
  });

  // Make sure _splits is always present (defensive)
  fullResults.forEach((r) => {
    if (!r._splits) r._splits = [];
  });

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
  // Club by id (#104): name of the edition; a merged id shows the main id's name.
  // cached club names ("stats" tag, the same index as /kluby), not all of cis_klub per view
  const clubs = createClubResolver(await getClubIndex());
  // Státní příslušnost (#200): vlaječka u zahraničních běžců.
  const nationalities = await loadNationalityMap(fullResults.map((r) => r.runnerId));
  const toRow = (r: ResultRow, rank: number | undefined, withCategory: boolean) => ({
    key: r.runnerId,
    runnerId: r.runnerId,
    runnerName: r.runnerName,
    nationality: nationalities.get(r.runnerId) ?? null,
    rank,
    birthYear: r.runnerId ? r.runnerId.substring(0, 4) : "—",
    club: clubs.display(r.clubId, r.year, r.club?.name || r.clubName),
    clubSlug: clubs.resolve(r.clubId, r.year, r.club?.name || r.clubName)?.slug ?? null,
    category: withCategory ? `${r.category?.name || r.categoryId} (${r._catRank}.)` : undefined,
    ...pickSplits(r._splits || []),
    time: r.time,
  });
  const dateLocale = isCs ? "cs-CZ" : "en-GB";
  const brand = home.raw("brand") as McvvHomepageContent["brand"];
  const nav = home.raw("nav") as McvvHomepageContent["nav"];
  const footer = withFooterYear(
    home.raw("footer") as McvvHomepageContent["footer"],
    years[0] ?? null,
  );

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <div className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold uppercase tracking-[2px] text-race-accent">
                {t("eyebrow")}
              </p>
              <div className="flex items-center gap-2">
                <NextLink
                  href={`/${locale}/statistiky`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-semibold text-race-accent border border-race-accent/60 rounded hover:bg-race-accent/10 transition"
                >
                  {t("stats")}
                </NextLink>
                <NextLink
                  href={`/${locale}/`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-semibold text-race-accent border border-race-accent/60 rounded hover:bg-race-accent/10 transition"
                >
                  ← {t("home")}
                </NextLink>
              </div>
            </div>
            <h1 className="mt-3 font-display text-5xl font-bold tracking-tight">{t("title")}</h1>
            <p className="mt-2 max-w-2xl text-race-muted">{t("intro")}</p>
          </div>

          {/* Year selector */}
          <div className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase text-race-dim">
              {t("selectYear")}
            </h2>
            <div className="flex flex-wrap gap-2">
              {years.map((y) => {
                const isActive = y === defaultYear;
                return (
                  <NextLink
                    key={y}
                    href={`/${locale}/results?year=${y}`}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      isActive
                        ? "bg-race-accent-solid text-white"
                        : "border border-race-line/50 hover:bg-race-forest"
                    }`}
                  >
                    {y}
                  </NextLink>
                );
              })}
            </div>
          </div>

          {/* Summary for selected year */}
          <div className="mb-10">
            <div className="rounded border border-race-line/50 bg-race-surface p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-display text-4xl font-bold">{defaultYear}</div>
                  <div className="text-xs uppercase text-race-accent">{t("edition")}</div>
                </div>
                <div className="bg-race-accent/15 px-4 py-1 text-sm font-semibold text-race-accent dark:text-orange-300">
                  {t("participants", { count: total })}
                </div>
              </div>

              <div className="mt-3 grid gap-4 md:grid-cols-2 items-start">
                {/* Left: info (date + weather) + overall winners */}
                <div>
                  <div className="text-xs font-semibold uppercase text-race-dim mb-1">
                    {t("info")}
                  </div>
                  {editionInfo?.date && (
                    <div className="text-xs text-race-muted">
                      {new Date(editionInfo.date).toLocaleDateString(dateLocale, {
                        day: "numeric",
                        month: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  )}
                  {editionInfo && (
                    <div className="text-xs text-race-muted">
                      {t("weather", {
                        weather: editionInfo.weather || "—",
                        temp: editionInfo.temp ?? "—",
                      })}
                    </div>
                  )}

                  <div className="text-xs font-semibold uppercase text-race-dim mb-1 mt-2">
                    {t("overallWinners")}
                  </div>
                  <div className="mt-1 grid gap-3">
                    {topMale && (
                      <div className="flex items-end justify-between gap-4 border-t border-race-line/45 pt-2">
                        <div>
                          <p className="text-xs font-semibold uppercase text-race-dim">
                            {t("men")}
                          </p>
                          <p className="mt-0.5 text-base font-semibold text-foreground">
                            <RunnerNameLink
                              id={topMale.runnerId}
                              name={topMale.runnerName}
                              nationality={nationalities.get(topMale.runnerId)}
                            />
                          </p>
                        </div>
                        <p className="font-display text-lg font-semibold text-race-accent">
                          {formatRaceTime(topMale.time)}
                        </p>
                      </div>
                    )}
                    {topFemale && (
                      <div className="flex items-end justify-between gap-4 border-t border-race-line/45 pt-2">
                        <div>
                          <p className="text-xs font-semibold uppercase text-race-dim">
                            {t("women")}
                          </p>
                          <p className="mt-0.5 text-base font-semibold text-foreground">
                            <RunnerNameLink
                              id={topFemale.runnerId}
                              name={topFemale.runnerName}
                              nationality={nationalities.get(topFemale.runnerId)}
                            />
                          </p>
                        </div>
                        <p className="font-display text-lg font-semibold text-race-accent">
                          {formatRaceTime(topFemale.time)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Category winners – moved up for compactness */}
                <div>
                  <div className="text-xs font-semibold uppercase text-race-dim mb-1">
                    {t("categoryWinners")}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {catWinners.map((w) => (
                      <a
                        key={w.id}
                        href={`#cat-${w.id}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-race-line/60 bg-race-surface hover:bg-race-forest hover:border-race-accent transition"
                      >
                        <span className="font-semibold text-race-accent">{w.category}</span>
                        <span className="text-race-muted">•</span>
                        <span className="font-semibold">{w.name}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Full results by categories for selected year (official style) */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-2xl font-semibold">
                {t("fullResults", { year: defaultYear })}
              </h3>
              <NextLink
                href={`/${locale}/results/${defaultYear}`}
                className="text-sm font-semibold text-race-accent hover:underline"
              >
                {t("dedicatedPage")} →
              </NextLink>
            </div>

            {/* View toggles moved below winners card + "Výsledková listina" heading */}
            <div className="mb-3 flex flex-wrap gap-2">
              <NextLink
                href={`/${locale}/results?year=${defaultYear}${view === "categories" ? "&view=absolute" : ""}${showSplits ? "&splits=true" : ""}`}
                className="rounded px-3 py-1 text-sm font-semibold transition border border-race-line/50 hover:bg-race-forest"
              >
                {view === "categories" ? t("toOverall") : t("toCategories")}
              </NextLink>
              {hasSplits ? (
                <NextLink
                  href={`/${locale}/results?year=${defaultYear}${view !== "categories" ? "&view=" + view : ""}${showSplits ? "" : "&splits=true"}`}
                  className="rounded px-3 py-1 text-sm font-semibold transition border border-race-line/50 hover:bg-race-forest"
                >
                  {showSplits ? t("hideSplits") : t("showSplits")}
                </NextLink>
              ) : null}
            </div>

            <div className="overflow-hidden rounded-lg border border-race-line/50 bg-race-surface">
              {view === "absolute" ? (
                // Absolute by sex - use precomputed to avoid disappearing results
                [
                  { label: t("menGroup"), items: absMen },
                  { label: t("womenGroup"), items: absWomen },
                ].map(({ label, items }) => (
                  <McvvResultsGroup
                    key={label}
                    title={`${label} (${items.length})`}
                    rows={items.map((r) => toRow(r, r._absRank, true))}
                    labels={labels}
                    showCategory
                    showSplits={showSplits}
                  />
                ))
              ) : // By categories
              orderedCategories.length === 0 ? (
                <div className="p-4 text-sm text-race-muted">{t("empty")}</div>
              ) : (
                orderedCategories.map((cat) => {
                  const group = catGroupsArch[cat.id] || [];
                  if (group.length === 0) return null;
                  return (
                    <McvvResultsGroup
                      id={`cat-${cat.id}`}
                      key={cat.id}
                      title={`${cat.name} (${group.length})`}
                      rows={group.map((r) => toRow(r, r._catRank, false))}
                      labels={labels}
                      showSplits={showSplits}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* Floating back to top */}
          <a
            href="#"
            className="fixed bottom-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-race-accent-solid text-white shadow-lg transition hover:bg-race-accent-solid-hover"
            aria-label={t("backToTop")}
          >
            ↑
          </a>
        </div>
      </div>
      <McvvFooter content={{ brand, footer }} />
    </main>
  );
}

export const dynamic = "force-dynamic";

function withDisplayName<T extends { runnerName: string | null; runner: { name: string } | null }>(
  row: T | null,
): (Omit<T, "runner"> & { runnerName: string | null }) | null {
  if (!row) return null;
  const { runner, ...rest } = row;
  return { ...rest, runnerName: runnerNameFor("results", row.runnerName, runner?.name) };
}
