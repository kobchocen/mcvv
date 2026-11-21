import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvPollRefresh } from "@/components/organisms/mcvv-poll-refresh";
import { McvvTestRunBanner } from "@/components/organisms/mcvv-test-run-banner";
import { Link, type Locale } from "@/i18n/routing";
import { requireSection } from "@/lib/admin/access";
import { prisma } from "@/lib/db/client";
import { courseOverview } from "@/lib/live/course-core";
import { getRaceContext, getStations } from "@/lib/live/race-context";
import { FINISH_SPLIT } from "@/lib/live/stations";
import { loadRoster } from "@/lib/race/roster";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "CourseAdmin" });
  return { title: t("title") };
}

const box = "grid gap-4 border border-race-line/60 bg-race-surface/40 p-5";

/** Přehled pro šéfa trati (#316): průchody kontrolami a vynechané kontroly. */
export default async function CourseOverviewPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireSection("raceControl.course", "read");
  const t = await getTranslations({ locale, namespace: "CourseAdmin" });
  const ctx = await getRaceContext();
  const [stations, roster, splits, starts] = await Promise.all([
    getStations(),
    loadRoster(ctx.year),
    prisma.split.findMany({ where: { year: ctx.year }, select: { bib: true, split: true } }),
    prisma.startCheck.findMany({ where: { year: ctx.year }, select: { bib: true } }),
  ]);
  const overview = courseOverview(
    stations,
    roster.map((r) => ({ bib: r.bib, name: r.runnerName, categoryId: r.categoryId })),
    splits,
    new Set(starts.map((s) => s.bib)),
  );
  const label = (code: string) =>
    code === FINISH_SPLIT ? t("finish") : (stations.find((s) => s.code === code)?.label ?? code);
  const km = (position: number | null) =>
    position === null
      ? "–"
      : `${(position / 10).toLocaleString(locale === "en" ? "en-GB" : "cs-CZ")} km`;
  const stats = [
    [t("roster"), overview.roster],
    [t("started"), overview.started],
    [t("anyCheckpoint"), overview.anyCheckpoint],
    [t("finished"), overview.finished],
  ] as const;

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <McvvPollRefresh intervalMs={15_000} />
      <div className="mx-auto grid max-w-5xl gap-8">
        <div>
          <McvvTestRunBanner locale={locale} leftovers className="mb-4" />
          <p className="mt-2 text-sm">
            <Link href="/admin/den-zavodu" className="text-race-accent hover:underline">
              ← {t("back")}
            </Link>
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {t("heading", { year: ctx.year })}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{t("intro")}</p>
        </div>

        <section className={box} data-testid="course-stats">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(([name, value]) => (
              <div key={name}>
                <dt className="text-sm text-race-muted">{name}</dt>
                <dd className="font-display text-3xl font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={box} data-testid="course-points">
          <h2 className="font-display text-xl font-semibold">{t("pointsTitle")}</h2>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-race-muted">
                <th className="py-1 pr-3">{t("colPoint")}</th>
                <th className="py-1 pr-3">{t("colPosition")}</th>
                <th className="py-1 pr-3">{t("colPassed")}</th>
                <th className="py-1">{t("colPublic")}</th>
              </tr>
            </thead>
            <tbody>
              {overview.points.map((point) => (
                <tr key={point.code} className="border-t border-race-line/40">
                  <td className="py-1 pr-3">
                    {point.label} <span className="text-race-muted">({point.code})</span>
                  </td>
                  <td className="py-1 pr-3">{km(point.position)}</td>
                  <td className="py-1 pr-3 font-semibold">{point.passed}</td>
                  <td className="py-1">
                    {stations.find((s) => s.code === point.code)?.public === false
                      ? t("internal")
                      : t("public")}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-race-line/40">
                <td className="py-1 pr-3">{t("finish")}</td>
                <td className="py-1 pr-3">–</td>
                <td className="py-1 pr-3 font-semibold">{overview.finished}</td>
                <td className="py-1">{t("public")}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section
          className={
            overview.skips.length > 0 ? "grid gap-3 border-2 border-red-500 bg-red-500/10 p-5" : box
          }
          data-testid="course-skips"
        >
          <h2 className="font-display text-xl font-semibold">
            {t("skipsTitle", { count: overview.skips.length })}
          </h2>
          {overview.skips.length === 0 ? (
            <p className="text-sm text-race-muted">{t("skipsNone")}</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {overview.skips.map((skip) => (
                <li key={skip.bib} className="font-semibold text-red-700 dark:text-red-300">
                  {t("skipRow", {
                    bib: skip.bib,
                    name: skip.name,
                    category: skip.categoryId,
                    at: label(skip.at),
                    missing: skip.missing.map(label).join(", "),
                  })}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
