import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import NextLink from "next/link";

import { prisma } from "@/lib/db/client";
import { formatRaceTime } from "@/lib/utils";
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
    },
  });

  const results: ResultRow[] = rawResults.map((r) => ({
    ...r,
    _clubName: r.club?.name || r.clubName || "—",
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

  return (
    <main className="min-h-screen bg-race-deep px-4 py-12 text-foreground sm:px-6 lg:px-8">
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
                  Počasí: {editionInfo.weather || "—"}, {editionInfo.temp ?? "—"} °C
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
              {isCs ? "Zpět na přehled ročníků" : "Back to all years"}
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
        <div className="overflow-x-auto rounded-lg border border-race-line/50 bg-race-surface">
          {orderedCats.map((cat) => {
            const group = (catGroups[cat.id] || []).sort((a, b) => a.time - b.time);
            if (group.length === 0) return null;
            return (
              <div id={`cat-${cat.id}`} key={cat.id} className="mb-6 last:mb-0">
                <div className="mt-4 first:mt-0 bg-race-accent/10 px-4 py-1.5 text-base font-display font-bold text-race-accent tracking-tight border-l-4 border-race-accent">
                  {cat.name} ({group.length})
                </div>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-race-line/40 bg-race-forest/50 text-xs font-semibold uppercase tracking-wider text-race-dim">
                      <th className="px-4 py-2">#</th>
                      <th className="px-4 py-2">{isCs ? "Jméno" : "Name"}</th>
                      <th className="px-4 py-2">Roč. nar.</th>
                      <th className="px-4 py-2">{isCs ? "Klub" : "Club"}</th>
                      <th className="px-4 py-2 text-right">{isCs ? "Čas" : "Time"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-race-line/30">
                    {group.map((r) => {
                      const timeStr = formatRaceTime(r.time);
                      return (
                        <tr key={`${r.year}-${r.runnerId}`} className="hover:bg-race-forest/30">
                          <td className="px-4 py-2 font-mono text-xs text-race-dim">
                            {r._catRank}
                          </td>
                          <td className="px-4 py-2 font-semibold">{r.runnerName || "—"}</td>
                          <td className="px-4 py-2 text-xs text-race-muted">{r._birthYear}</td>
                          <td className="px-4 py-2 text-race-muted">{r._clubName}</td>
                          <td className="px-4 py-2 text-right font-display text-base font-semibold text-race-accent">
                            {timeStr}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {/* Floating back to top */}
        <a
          href="#"
          className="fixed bottom-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-race-accent text-white shadow-lg transition hover:bg-race-accent-hover"
          aria-label="Nahoru"
        >
          ↑
        </a>
      </div>
    </main>
  );
}

export function generateStaticParams() {
  // Will be dynamic in practice, but can pre-render recent years if wanted.
  // For now dynamic.
  return [];
}

export const dynamic = "force-dynamic";
