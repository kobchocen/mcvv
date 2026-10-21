import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/admin/staff";
import { currentRaceYear } from "@/lib/entries/year";
import { loadTombolaPool, tombolaYears } from "@/lib/raceday/tombola";
import {
  drawTombola,
  newTombolaSeed,
  parseExcludedClubs,
  parseTombolaCount,
  parseTombolaSeed,
  tombolaClubs,
} from "@/lib/raceday/tombola-core";
import { redirect, type Locale } from "@/i18n/routing";

type SearchParams = {
  rok?: string;
  pocet?: string;
  los?: string;
  novy?: string;
  f?: string;
  vynechat?: string | string[];
};

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "AfterRace" });
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

const input = "h-9 rounded border border-race-line bg-transparent px-2 text-sm";
const label = "flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-race-dim";

function list(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export default async function AfterRacePage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireStaff();
  const t = await getTranslations({ locale, namespace: "AfterRace" });
  const query = await searchParams;

  const [years, current] = await Promise.all([tombolaYears(), currentRaceYear()]);
  const requested = Number(query.rok);
  const year = years.includes(requested)
    ? requested
    : years.includes(current.year)
      ? current.year
      : (years[0] ?? current.year);
  const count = parseTombolaCount(query.pocet);
  const submitted = query.f === "1";
  const excluded = parseExcludedClubs(list(query.vynechat), submitted);
  const seed = query.novy ? null : parseTombolaSeed(query.los);
  if (!seed) {
    // Los do URL, ať obnovení stránky nebo tisk výsledek nezmění.
    redirect({
      href: {
        pathname: "/admin/po-zavode",
        query: {
          rok: String(year),
          pocet: String(count),
          los: newTombolaSeed(),
          f: "1",
          vynechat: [...excluded],
        },
      },
      locale,
    });
  }

  const pool = await loadTombolaPool(year);
  const clubs = tombolaClubs(pool.entrants);
  const drawn = drawTombola(pool.entrants, { count, seed: seed!, excludedClubs: excluded });
  const eligible = pool.entrants.filter((e) => !excluded.has(e.clubId.toUpperCase())).length;

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <McvvAdminHomeLink label={t("adminHome")} />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {t("heading", { year })}
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-race-muted">{t("intro")}</p>

        <section className="mt-8 border border-race-line/55 bg-race-surface p-5 print:hidden">
          <h2 className="font-display text-xl font-semibold">{t("tombola")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-race-muted">{t("tombolaHint")}</p>
          <form method="get" className="mt-4 flex flex-col gap-4" data-testid="tombola-form">
            <input type="hidden" name="f" value="1" />
            <input type="hidden" name="los" value={seed!} />
            <div className="flex flex-wrap items-end gap-4">
              <label className={label}>
                {t("year")}
                <select name="rok" defaultValue={String(year)} className={`${input} w-28`}>
                  {(years.length ? years : [year]).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                {t("count")}
                <input
                  name="pocet"
                  type="number"
                  min={1}
                  max={200}
                  defaultValue={count}
                  className={`${input} w-24`}
                />
              </label>
              <Button type="submit" variant="outline" className="border-race-line">
                {t("apply")}
              </Button>
              <Button type="submit" name="novy" value="1">
                {t("redraw")}
              </Button>
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                {t("excludeClubs", { count: excluded.size })}
              </summary>
              <div className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {clubs.map((club) => (
                  <label key={club.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="vynechat"
                      value={club.id}
                      defaultChecked={excluded.has(club.id)}
                    />
                    <span>
                      {club.name} <span className="text-race-dim">({club.count})</span>
                    </span>
                  </label>
                ))}
              </div>
            </details>
          </form>
        </section>

        <section className="mt-8" data-testid="tombola-result">
          <p className="text-sm text-race-muted">
            {pool.source === "none"
              ? t("noFinishers")
              : t("poolInfo", {
                  eligible,
                  total: pool.entrants.length,
                  source: pool.source === "results" ? t("sourceResults") : t("sourceSplits"),
                  seed: seed!,
                })}
          </p>
          {drawn.length > 0 ? (
            <ol className="mt-4 grid gap-x-8 gap-y-2 text-lg sm:grid-cols-2">
              {drawn.map((entrant, index) => (
                <li key={entrant.runnerId} className="flex gap-3 border-b border-race-line/40 pb-1">
                  <span className="w-8 text-right font-display font-bold text-race-accent">
                    {index + 1}.
                  </span>
                  <span>
                    <strong>{entrant.name}</strong>{" "}
                    <span className="text-race-muted">({entrant.runnerId.slice(0, 4)})</span>
                    <span className="block text-sm text-race-dim">{entrant.club}</span>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      </div>
    </main>
  );
}
