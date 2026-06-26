import { setRequestLocale } from "next-intl/server";
import NextLink from "next/link";

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
  const showSplits = sp?.splits === "true";

  const isCs = locale === "cs";

  // All years with participant counts + basic top info for summary cards
  const yearData = await prisma.result.groupBy({
    by: ["year"],
    _count: { runnerId: true },
    orderBy: { year: "desc" },
  });

  const years = yearData.map((y) => y.year);
  const countMap = Object.fromEntries(yearData.map((y) => [y.year, y._count.runnerId]));

  // Default to latest or selected
  const defaultYear =
    selectedYearParam && years.includes(selectedYearParam)
      ? selectedYearParam
      : (years[0] ?? new Date().getFullYear());

  // Fetch top male + female for the default year (for summary)
  const [topMale, topFemale] = await Promise.all([
    prisma.result.findFirst({
      where: { year: defaultYear, category: { sex: "M" } },
      orderBy: { time: "asc" },
      select: { runnerName: true, time: true, categoryId: true },
    }),
    prisma.result.findFirst({
      where: { year: defaultYear, category: { sex: "F" } },
      orderBy: { time: "asc" },
      select: { runnerName: true, time: true, categoryId: true },
    }),
  ]);

  const fullResultsRaw = await prisma.result.findMany({
    where: { year: defaultYear },
    orderBy: { time: "asc" },
    include: {
      category: { select: { name: true, sex: true } },
      club: { select: { name: true } },
    },
  });

  const fullResults: ResultRow[] = fullResultsRaw.map((r) => ({
    ...r,
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
        time: formatRaceTime(top.time),
      };
    })
    .filter((w): w is { id: string; category: string; name: string; time: string } => w !== null);

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

  return (
    <main className="min-h-screen bg-race-deep px-4 py-12 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold uppercase tracking-[2px] text-race-accent">
              {isCs ? "05 — Výsledky a historie" : "05 — Results and history"}
            </p>
            <NextLink
              href={`/${locale}/`}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-semibold text-race-accent border border-race-accent/60 rounded hover:bg-race-accent/10 transition"
            >
              ← {isCs ? "Domů" : "Home"}
            </NextLink>
          </div>
          <h1 className="mt-3 font-display text-5xl font-bold tracking-tight">
            {isCs ? "Archiv výsledků" : "Results Archive"}
          </h1>
          <p className="mt-2 max-w-2xl text-race-muted">
            {isCs
              ? "Vyberte ročník a prohlédněte si kompletní výsledkovou listinu."
              : "Select a year to view the complete results list."}
          </p>
        </div>

        {/* Year selector */}
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase text-race-dim">
            {isCs ? "Vyberte ročník" : "Select year"}
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
                      ? "bg-race-accent text-white"
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
                <div className="text-xs uppercase text-race-accent">
                  {isCs ? "Ročník" : "Edition"}
                </div>
              </div>
              <div className="bg-race-accent/15 px-4 py-1 text-sm font-semibold text-race-accent">
                {total} {isCs ? "účastníků" : "participants"}
              </div>
            </div>

            <div className="mt-3 grid gap-4 md:grid-cols-2 items-start">
              {/* Left: INFORMACE (date + weather) + absolutní vítězové */}
              <div>
                <div className="text-xs font-semibold uppercase text-race-dim mb-1">INFORMACE</div>
                {editionInfo?.date && (
                  <div className="text-xs text-race-muted">
                    {new Date(editionInfo.date).toLocaleDateString("cs-CZ", {
                      day: "numeric",
                      month: "numeric",
                      year: "numeric",
                    })}
                  </div>
                )}
                {editionInfo && (
                  <div className="text-xs text-race-muted">
                    Počasí: {editionInfo.weather || "—"}, {editionInfo.temp ?? "—"} °C
                  </div>
                )}

                <div className="text-xs font-semibold uppercase text-race-dim mb-1 mt-2">
                  ABSOLUTNÍ VÍTĚZOVÉ
                </div>
                <div className="mt-1 grid gap-3">
                  {topMale && (
                    <div className="flex items-end justify-between gap-4 border-t border-race-line/45 pt-2">
                      <div>
                        <p className="text-xs font-semibold uppercase text-race-dim">MUŽI</p>
                        <p className="mt-0.5 text-base font-semibold text-foreground">
                          {topMale.runnerName}
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
                        <p className="text-xs font-semibold uppercase text-race-dim">ŽENY</p>
                        <p className="mt-0.5 text-base font-semibold text-foreground">
                          {topFemale.runnerName}
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
                  Vítězové kategorií
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
              {isCs ? `Výsledková listina ${defaultYear}` : `Full results ${defaultYear}`}
            </h3>
            <NextLink
              href={`/${locale}/results/${defaultYear}`}
              className="text-sm font-semibold text-race-accent hover:underline"
            >
              {isCs ? "Otevřít samostatnou stránku →" : "Open dedicated page →"}
            </NextLink>
          </div>

          {/* View toggles moved below winners card + "Výsledková listina" heading */}
          <div className="mb-3 flex flex-wrap gap-2">
            <NextLink
              href={`/${locale}/results?year=${defaultYear}${view === "categories" ? "&view=absolute" : ""}${showSplits ? "&splits=true" : ""}`}
              className="rounded px-3 py-1 text-sm font-semibold transition border border-race-line/50 hover:bg-race-forest"
            >
              {view === "categories" ? "Přepnout na absolutní" : "Přepnout na kategorie"}
            </NextLink>
            <NextLink
              href={`/${locale}/results?year=${defaultYear}${view !== "categories" ? "&view=" + view : ""}${showSplits ? "" : "&splits=true"}`}
              className="rounded px-3 py-1 text-sm font-semibold transition border border-race-line/50 hover:bg-race-forest"
            >
              {showSplits ? "Skrýt mezičasy" : "Zobrazit mezičasy"}
            </NextLink>
          </div>

          <div className="overflow-x-auto rounded-lg border border-race-line/50 bg-race-surface">
            {view === "absolute" ? (
              // Absolute by sex - use precomputed to avoid disappearing results
              <>
                {[
                  { label: isCs ? "Muži" : "Men", items: absMen },
                  { label: isCs ? "Ženy" : "Women", items: absWomen },
                ].map(({ label, items }) => {
                  const safeItems = items || [];
                  return (
                    <div key={label} className="mb-4 last:mb-0">
                      <div className="mt-4 first:mt-0 bg-race-accent/10 px-4 py-1.5 text-base font-display font-bold text-race-accent tracking-tight border-l-4 border-race-accent">
                        {label} ({safeItems.length})
                      </div>
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-race-line/40 bg-race-forest/50 text-xs font-semibold uppercase tracking-wider text-race-dim">
                            <th className="px-4 py-2">#</th>
                            <th className="px-4 py-2">{isCs ? "Jméno" : "Name"}</th>
                            <th className="px-4 py-2">Roč. nar.</th>
                            <th className="px-4 py-2">{isCs ? "Klub" : "Club"}</th>
                            <th className="px-4 py-2">Kat.</th>
                            {showSplits && (
                              <>
                                <th className="px-4 py-2 text-xs">Mezičas 1</th>
                                <th className="px-4 py-2 text-xs">Mezičas 2</th>
                              </>
                            )}
                            <th className="px-4 py-2 text-right">{isCs ? "Čas" : "Time"}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-race-line/30">
                          {safeItems.length === 0 ? (
                            <tr>
                              <td
                                colSpan={showSplits ? 8 : 6}
                                className="px-4 py-2 text-xs text-race-muted"
                              >
                                Žádné výsledky.
                              </td>
                            </tr>
                          ) : (
                            safeItems.map((r) => {
                              const timeStr = formatRaceTime(r.time);
                              const m1 = (r._splits || []).find((s) => s.split === "1");
                              const m2 = (r._splits || []).find((s) => s.split === "3");
                              const katWithRank = `${r.category?.name || r.categoryId} (${r._catRank}.)`;
                              const birth = r.runnerId ? r.runnerId.substring(0, 4) : "—";
                              const clubN = r.club?.name || r.clubName || "—";
                              return (
                                <tr key={r.runnerId} className="hover:bg-race-forest/30">
                                  <td className="px-4 py-2 font-mono text-xs text-race-dim">
                                    {r._absRank}
                                  </td>
                                  <td className="px-4 py-2 font-semibold">{r.runnerName || "—"}</td>
                                  <td className="px-4 py-2 text-xs text-race-muted">{birth}</td>
                                  <td className="px-4 py-2 text-race-muted">{clubN}</td>
                                  <td className="px-4 py-2 text-race-muted text-xs">
                                    {katWithRank}
                                  </td>
                                  {showSplits && (
                                    <>
                                      <td className="px-4 py-2 text-xs text-race-muted">
                                        {m1 ? formatRaceTime(m1.time) : "—"}
                                      </td>
                                      <td className="px-4 py-2 text-xs text-race-muted">
                                        {m2 ? formatRaceTime(m2.time) : "—"}
                                      </td>
                                    </>
                                  )}
                                  <td className="px-4 py-2 text-right font-display text-base font-semibold text-race-accent">
                                    {timeStr}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </>
            ) : // By categories
            orderedCategories.length === 0 ? (
              <div className="p-4 text-sm text-race-muted">Žádné výsledky.</div>
            ) : (
              orderedCategories.map((cat) => {
                const group = catGroupsArch[cat.id] || [];
                if (group.length === 0) return null;
                return (
                  <div id={`cat-${cat.id}`} key={cat.id} className="mb-4 last:mb-0">
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
                          {showSplits && (
                            <>
                              <th className="px-4 py-2 text-xs">Mezičas 1</th>
                              <th className="px-4 py-2 text-xs">Mezičas 2</th>
                            </>
                          )}
                          <th className="px-4 py-2 text-right">{isCs ? "Čas" : "Time"}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-race-line/30">
                        {group.map((r) => {
                          const timeStr = formatRaceTime(r.time);
                          const m1 = (r._splits || []).find((s) => s.split === "1");
                          const m2 = (r._splits || []).find((s) => s.split === "3");
                          const birth = r.runnerId ? r.runnerId.substring(0, 4) : "—";
                          const clubN = r.club?.name || r.clubName || "—";
                          return (
                            <tr key={r.runnerId} className="hover:bg-race-forest/30">
                              <td className="px-4 py-2 font-mono text-xs text-race-dim">
                                {r._catRank}
                              </td>
                              <td className="px-4 py-2 font-semibold">{r.runnerName || "—"}</td>
                              <td className="px-4 py-2 text-xs text-race-muted">{birth}</td>
                              <td className="px-4 py-2 text-race-muted">{clubN}</td>
                              {showSplits && (
                                <>
                                  <td className="px-4 py-2 text-xs text-race-muted">
                                    {m1 ? formatRaceTime(m1.time) : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-xs text-race-muted">
                                    {m2 ? formatRaceTime(m2.time) : "—"}
                                  </td>
                                </>
                              )}
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
              })
            )}
          </div>
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

export const dynamic = "force-dynamic";
