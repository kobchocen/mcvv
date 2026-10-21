import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { RunnerNameLink } from "@/components/molecules";
import { McvvPublicNavbar } from "@/components/organisms";
import { McvvPlaceholderPage, type McvvHomepageContent } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { shortBirthYear } from "@/lib/format/birth-year";
import { currentRaceYear, editionNumber } from "@/lib/entries/year";
import { detailLine } from "@/lib/results/table";
import { formatClock, startSeriesForBib } from "@/lib/race/start-time";
import { loadPublicStartList, loadStartSettings } from "@/lib/race/startlist-load";
import { getSiteSettings } from "@/lib/settings/site";
import { Link, type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kat?: string; q?: string }>;
}>;

/**
 * Same mobile pattern as the results tables: below sm the club and category columns become a
 * 2nd line under the name, start time / bib / birth year shrink to their content.
 */
const cx = {
  time: "w-[1%] whitespace-nowrap py-1.5 pl-2.5 pr-1.5 sm:w-auto sm:px-4 sm:py-2",
  bib: "w-[1%] whitespace-nowrap px-1.5 py-1.5 text-right sm:w-auto sm:px-4 sm:py-2",
  name: "px-1.5 py-1.5 leading-tight [overflow-wrap:anywhere] sm:px-4 sm:py-2 sm:leading-normal sm:[overflow-wrap:normal]",
  birth: "w-[1%] whitespace-nowrap py-1.5 pl-1.5 pr-2.5 sm:w-auto sm:px-4 sm:py-2",
  desktop: "hidden px-4 py-2 sm:table-cell",
} as const;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  const t = await getTranslations({ locale, namespace: "StartList" });
  return { title: t("title") };
}

export default async function StartListPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "StartList" });
  const brand = home.raw("brand") as McvvHomepageContent["brand"];
  const nav = home.raw("nav") as McvvHomepageContent["nav"];
  const [raceYear, site] = await Promise.all([currentRaceYear(), getSiteSettings()]);

  if (!site.startlistPublished) {
    return (
      <McvvPlaceholderPage
        brand={brand}
        nav={nav}
        eyebrow={copy("eyebrow", { n: editionNumber(raceYear) })}
        title={copy("title")}
        status={copy("status")}
      />
    );
  }

  const settings = await loadStartSettings(raceYear.year);
  const { model } = settings;
  const { rows } = await loadPublicStartList(raceYear.year, model);
  const { kat, q } = await searchParams;
  const categories = settings.categories.filter((c) => rows.some((r) => r.categoryId === c.id));
  const category = categories.some((c) => c.id === kat) ? kat! : "";
  const search = normalize((q ?? "").trim()).slice(0, 80);
  const visible = rows.filter(
    (row) =>
      (!category || row.categoryId === category) &&
      (!search ||
        normalize(row.name).includes(search) ||
        normalize(row.club).includes(search) ||
        String(row.bib) === search),
  );
  const filtered = Boolean(category || search);

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {copy("eyebrow", { n: editionNumber(raceYear) })}
            </p>
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold text-foreground dark:text-white sm:text-5xl">
            {copy("title")}
          </h1>
          <p className="mt-4 text-base text-foreground dark:text-white">
            {copy("count", { count: rows.length })}
          </p>
          <p className="mt-2 text-sm text-race-muted">
            {copy("intro", {
              interval: model.intervalSeconds,
              zero: formatClock(model.zeroSeconds),
            })}
          </p>

          <form method="get" className="mt-8 flex flex-wrap items-end gap-3">
            <label className="grid w-full gap-1 text-sm sm:w-auto">
              <span className="text-race-muted">{copy("filterCategory")}</span>
              <select
                name="kat"
                defaultValue={category}
                className="h-10 w-full border border-race-line bg-race-surface px-2 sm:w-auto"
              >
                <option value="">{copy("filterAll")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 flex-1 gap-1 text-sm sm:flex-none">
              <span className="text-race-muted">{copy("filterSearch")}</span>
              <input
                name="q"
                type="search"
                defaultValue={q ?? ""}
                maxLength={80}
                className="h-10 w-full border border-race-line bg-race-surface px-2 sm:w-64"
              />
            </label>
            <Button
              type="submit"
              variant="outline"
              className="h-10 border-race-line bg-race-surface"
            >
              {copy("filter")}
            </Button>
            {filtered ? (
              <Link href="/startovka" className="h-10 content-center text-sm text-race-accent">
                {copy("reset")}
              </Link>
            ) : null}
          </form>

          <div className="mt-6 -mx-4 sm:mx-0">
            {visible.length === 0 ? (
              <p className="px-4 text-sm text-race-muted sm:px-0">
                {rows.length === 0 ? copy("status") : copy("none")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" data-testid="startlist-table">
                  <thead>
                    <tr className="border-b border-race-line/40 bg-race-forest/50 text-xs font-semibold uppercase tracking-wider text-race-dim">
                      <th className={cx.time}>{copy("colTime")}</th>
                      <th className={cx.bib}>{copy("colBib")}</th>
                      <th className={cx.name}>{copy("colName")}</th>
                      <th className={cx.birth}>
                        <span className="hidden sm:inline">{copy("colBirth")}</span>
                        <span className="sm:hidden">{copy("colBirthShort")}</span>
                      </th>
                      <th className={cx.desktop}>{copy("colClub")}</th>
                      <th className={cx.desktop}>{copy("colCategory")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-race-line/30">
                    {visible.map((row) => (
                      <tr key={row.runnerId} className="hover:bg-race-forest/30">
                        <td
                          className={`${cx.time} font-display font-semibold tabular-nums text-foreground dark:text-white`}
                        >
                          {row.time}
                        </td>
                        <td
                          className={`${cx.bib} font-mono text-xs font-semibold ${startSeriesForBib(model, row.bib) === 2 ? "text-foreground dark:text-white" : "text-race-dim"}`}
                        >
                          {row.bib}
                        </td>
                        <td className={`${cx.name} font-semibold`}>
                          <RunnerNameLink id={row.runnerId} name={row.name} />
                          <span className="mt-px block text-xs leading-[1.3] font-normal text-race-muted sm:hidden">
                            {detailLine(row.club, row.categoryName)}
                          </span>
                        </td>
                        <td className={`${cx.birth} text-xs text-race-muted`}>
                          <span className="hidden sm:inline">{row.birthYear}</span>
                          <span className="sm:hidden">{shortBirthYear(row.birthYear)}</span>
                        </td>
                        <td className={`${cx.desktop} text-race-muted`}>{row.club}</td>
                        <td className={`${cx.desktop} text-xs text-race-muted`}>
                          {row.categoryName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
