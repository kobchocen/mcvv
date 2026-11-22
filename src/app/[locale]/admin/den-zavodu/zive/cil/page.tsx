import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvTestRunBanner } from "@/components/organisms/mcvv-test-run-banner";
import { Link, type Locale } from "@/i18n/routing";
import { canAccess, requireSection } from "@/lib/admin/access";
import { finishCorrectionAction } from "@/lib/live/finish-actions";
import { loadFinishState } from "@/lib/live/finish";
import type { FinishIssue, FinishPair } from "@/lib/live/finish-core";
import { getLiveRaceContext } from "@/lib/testmode/run";
import { formatRaceTime } from "@/lib/live/start-time";
import { McvvTestModeBanner } from "@/components/molecules/mcvv-test-mode-banner";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ vse?: string; error?: string; saved?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "FinishAdmin" });
  return { title: t("title") };
}

const box = "grid gap-4 border border-race-line/60 bg-race-surface/40 p-4";
const legend = "px-1 font-display text-lg font-semibold";
const input = "h-9 w-20 border border-race-line bg-race-surface px-2 text-sm tabular-nums";
const smallButton =
  "h-9 border border-race-line/60 bg-race-surface px-2 text-xs font-semibold hover:border-race-accent";
const dangerButton =
  "h-9 border border-red-500/60 px-2 text-xs font-semibold text-red-600 dark:text-red-400";

function clockTenths(ms: number): string {
  const base = new Date(ms).toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague" });
  return `${base}.${Math.floor((ms % 1000) / 100)}`;
}

const SERIOUS: FinishIssue[] = [
  "missing-bib",
  "missing-punch",
  "unknown-bib",
  "duplicate-bib",
  "too-long",
  "too-fast",
];

/** Cíl (#252): párování fronty časů ze stopek s opsanými čísly a jeho opravy. */
export default async function FinishAdminPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const sp = await searchParams;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireSection("raceControl.finish", "read");
  const canWrite = await canAccess("raceControl.finish", "write");
  const t = await getTranslations({ locale, namespace: "FinishAdmin" });
  const ctx = await getLiveRaceContext();
  const state = await loadFinishState(ctx);
  const showAll = sp.vse === "1";
  const pairs = showAll
    ? state.pairs
    : state.pairs.filter(
        (pair, index) =>
          pair.issues.some((i) => SERIOUS.includes(i)) || index >= state.pairs.length - 30,
      );
  const nextBib = (pair: FinishPair) =>
    state.pairs.find((other) => other.position > pair.position && other.bib)?.bib ?? null;

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <McvvTestModeBanner locale={locale as Locale} ctx={ctx} />
      <div className="mx-auto grid max-w-5xl gap-8">
        <div>
          <McvvTestRunBanner locale={locale} leftovers className="mb-4" />
          <p className="mt-2 text-sm">
            <Link href="/admin/den-zavodu/zive" className="text-race-accent hover:underline">
              ← {t("back")}
            </Link>
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {t("heading", { year: ctx.year })}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{t("intro")}</p>
          {sp.error ? (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {t(sp.error === "missing" ? "errorMissing" : "errorInvalid")}
            </p>
          ) : sp.saved ? (
            <p role="status" className="mt-4 text-sm text-race-accent">
              {t("saved")}
            </p>
          ) : null}
        </div>

        <dl
          className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4"
          data-testid="finish-summary"
        >
          {(
            [
              ["punches", state.summary.punches],
              ["bibs", state.summary.bibs],
              ["complete", state.summary.complete],
              ["problems", state.summary.problems],
            ] as const
          ).map(([key, value]) => (
            <div
              key={key}
              className={`border p-3 ${
                key === "problems" && value > 0
                  ? "border-amber-500/70 bg-amber-500/10"
                  : "border-race-line/50 bg-race-surface"
              }`}
            >
              <dt className="text-xs text-race-muted">{t(`summary.${key}`)}</dt>
              <dd className="font-display text-2xl font-bold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <fieldset className={box}>
          <legend className={legend}>{t("pairsTitle")}</legend>
          <p className="text-xs text-race-muted">
            {showAll ? t("showingAll") : t("showingProblems")}{" "}
            <Link
              href={{ pathname: "/admin/den-zavodu/zive/cil", query: showAll ? {} : { vse: "1" } }}
              className="text-race-accent hover:underline"
            >
              {showAll ? t("showProblems") : t("showAll")}
            </Link>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="finish-pairs">
              <thead className="text-xs text-race-muted">
                <tr>
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">{t("colPunch")}</th>
                  <th className="py-1 pr-2">{t("colBib")}</th>
                  <th className="py-1 pr-2">{t("colRunner")}</th>
                  <th className="py-1 pr-2">{t("colTime")}</th>
                  <th className="py-1 pr-2">{t("colIssues")}</th>
                  {canWrite ? <th className="py-1">{t("colActions")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {pairs.map((pair) => {
                  const runner = pair.bib ? state.names.get(pair.bib.bib) : undefined;
                  const serious = pair.issues.some((i) => SERIOUS.includes(i) && i !== "too-fast");
                  const next = nextBib(pair);
                  return (
                    <tr
                      key={pair.position}
                      className={`border-t border-race-line/40 align-top ${
                        serious ? "bg-amber-500/10" : ""
                      }`}
                    >
                      <td className="py-2 pr-2 tabular-nums">{pair.position}</td>
                      <td className="py-2 pr-2 tabular-nums">
                        {pair.punch ? clockTenths(pair.punch.punchedAt) : "–"}
                        {pair.punch?.source === "admin" ? ` (${t("manual")})` : ""}
                      </td>
                      <td className="py-2 pr-2 font-display text-lg font-bold tabular-nums">
                        {pair.bib?.bib ?? "–"}
                      </td>
                      <td className="py-2 pr-2">
                        {runner ? `${runner.name} (${runner.categoryId})` : ""}
                      </td>
                      <td className="py-2 pr-2 tabular-nums">
                        {pair.time !== null ? formatRaceTime(pair.time) : "–"}
                      </td>
                      <td className="py-2 pr-2 text-xs">
                        {pair.issues.map((issue) => (
                          <span
                            key={issue}
                            className="mr-1 inline-block rounded-full border border-amber-500/60 px-2 py-0.5 text-amber-700 dark:text-amber-300"
                          >
                            {t(`issue.${issue}`)}
                          </span>
                        ))}
                      </td>
                      {canWrite ? (
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {pair.punch ? (
                              <form action={finishCorrectionAction}>
                                <input type="hidden" name="op" value="delete-punch" />
                                <input type="hidden" name="id" value={pair.punch.id} />
                                <button type="submit" className={dangerButton}>
                                  {t("deletePunch")}
                                </button>
                              </form>
                            ) : null}
                            {pair.bib ? (
                              <>
                                <form action={finishCorrectionAction}>
                                  <input type="hidden" name="op" value="delete-bib" />
                                  <input type="hidden" name="id" value={pair.bib.id} />
                                  <button type="submit" className={dangerButton}>
                                    {t("deleteBib")}
                                  </button>
                                </form>
                                {next ? (
                                  <form action={finishCorrectionAction}>
                                    <input type="hidden" name="op" value="swap-bibs" />
                                    <input type="hidden" name="id" value={pair.bib.id} />
                                    <input type="hidden" name="otherId" value={next.id} />
                                    <button type="submit" className={smallButton}>
                                      {t("swapNext")}
                                    </button>
                                  </form>
                                ) : null}
                                <form action={finishCorrectionAction} className="flex gap-1">
                                  <input type="hidden" name="op" value="change-bib" />
                                  <input type="hidden" name="id" value={pair.bib.id} />
                                  <input
                                    name="bib"
                                    inputMode="numeric"
                                    aria-label={t("changeBib")}
                                    placeholder={t("bibPlaceholder")}
                                    className={input}
                                  />
                                  <button type="submit" className={smallButton}>
                                    {t("changeBib")}
                                  </button>
                                </form>
                                <form action={finishCorrectionAction} className="flex gap-1">
                                  <input type="hidden" name="op" value="insert-bib" />
                                  <input type="hidden" name="id" value={pair.bib.id} />
                                  <input
                                    name="bib"
                                    inputMode="numeric"
                                    aria-label={t("insertBefore")}
                                    placeholder={t("bibPlaceholder")}
                                    className={input}
                                  />
                                  <button type="submit" className={smallButton}>
                                    {t("insertBefore")}
                                  </button>
                                </form>
                              </>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </fieldset>

        {canWrite ? (
          <fieldset className={box}>
            <legend className={legend}>{t("addTitle")}</legend>
            <p className="text-xs text-race-muted">{t("addIntro")}</p>
            <form action={finishCorrectionAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="op" value="insert-punch" />
              <label className="grid gap-1 text-xs">
                {t("missingPunch")}
                <input name="clock" placeholder="10:42:07.3" className={`${input} w-32`} />
              </label>
              <button type="submit" className={smallButton}>
                {t("addPunch")}
              </button>
            </form>
            <form action={finishCorrectionAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="op" value="insert-bib" />
              <label className="grid gap-1 text-xs">
                {t("missingBibEnd")}
                <input name="bib" inputMode="numeric" className={input} />
              </label>
              <button type="submit" className={smallButton}>
                {t("addBib")}
              </button>
            </form>
          </fieldset>
        ) : null}

        {state.deletedPunches.length + state.deletedBibs.length > 0 ? (
          <fieldset className={box}>
            <legend className={legend}>{t("deletedTitle")}</legend>
            <ul className="grid gap-1 text-sm">
              {state.deletedPunches.map((row) => (
                <li key={`p${row.id}`} className="flex items-center gap-2">
                  <span className="flex-1 tabular-nums">
                    {t("deletedPunch", { time: clockTenths(row.punchedAt) })}
                  </span>
                  {canWrite ? (
                    <form action={finishCorrectionAction}>
                      <input type="hidden" name="op" value="restore-punch" />
                      <input type="hidden" name="id" value={row.id} />
                      <button type="submit" className={smallButton}>
                        {t("restore")}
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
              {state.deletedBibs.map((row) => (
                <li key={`b${row.id}`} className="flex items-center gap-2">
                  <span className="flex-1 tabular-nums">
                    {t("deletedBib", { bib: row.bib, time: clockTenths(row.readAt) })}
                  </span>
                  {canWrite ? (
                    <form action={finishCorrectionAction}>
                      <input type="hidden" name="op" value="restore-bib" />
                      <input type="hidden" name="id" value={row.id} />
                      <button type="submit" className={smallButton}>
                        {t("restore")}
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
