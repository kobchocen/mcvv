import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, type Locale } from "@/i18n/routing";
import { canAccess, requireSection } from "@/lib/admin/access";
import { formatDateTime } from "@/lib/format/date";
import {
  cleanupTestModeNowAction,
  endTestModeNowAction,
  saveTestModeConfigAction,
  startTestModeNowAction,
} from "@/lib/testmode/actions";
import { testPhase } from "@/lib/testmode/config-core";
import type { TestReport } from "@/lib/testmode/run";
import {
  FICTIONAL_MAX,
  listTestModeRuns,
  loadTestModeConfig,
  TEST_MODE_FIXED,
  TEST_SHADOW_YEAR,
} from "@/lib/testmode/config";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; run?: string; runError?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "TestMode" });
  return { title: t("title") };
}

const box = "grid gap-4 border border-race-line/60 bg-race-surface/40 p-4";
const legend = "px-1 font-display text-lg font-semibold";

/**
 * Testovací režim závodu (B+, bod 6): zatím jen výchozí hodnoty (otevřené otázky §9 návrhu)
 * a přehled testů ve stínovém ročníku. Spouštění testů zůstává na stránce Živě (#186).
 */
export default async function TestModePage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const { saved, error, run: runDone, runError } = await searchParams;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireSection("raceControl.live", "read");
  const [t, admin, config, runs, canWrite] = await Promise.all([
    getTranslations({ locale, namespace: "TestMode" }),
    getTranslations({ locale, namespace: "Admin" }),
    loadTestModeConfig(),
    listTestModeRuns(),
    canAccess("raceControl.live", "write"),
  ]);
  const now = new Date();
  const active = runs.find((run) => run.status === "running" || run.status === "ended") ?? null;
  const fixed = Object.entries(TEST_MODE_FIXED).map(([key, value]) =>
    t(`fixed.${key}` as "fixed.mainScenario", { value: String(value) }),
  );

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-4xl gap-8">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-race-muted">
            {t("intro", { year: TEST_SHADOW_YEAR })}
          </p>
          <p className="mt-3 text-sm">
            <Link
              href="/admin/den-zavodu/zive"
              className="font-medium text-race-accent hover:underline"
            >
              {t("backToLive")}
            </Link>
          </p>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {t(`error.${error}` as never)}
            </p>
          ) : saved ? (
            <p role="status" className="mt-4 text-sm text-race-accent">
              {t("saved")}
            </p>
          ) : null}
          {runError ? (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {t(`runError.${runError}` as never)}
            </p>
          ) : runDone ? (
            <p role="status" className="mt-4 text-sm text-race-accent">
              {t(`runDone.${runDone}` as never)}
            </p>
          ) : null}
        </div>

        <fieldset
          className={`${box} ${active ? "border-amber-500" : ""}`}
          data-testid="testmode-active"
        >
          <legend className={legend}>{t("activeTitle")}</legend>
          {active ? (
            <>
              <p className="text-sm">
                {t("activeInfo", {
                  phase: t(`phase.${testPhase(active, now)}`),
                  zero: formatDateTime(active.zeroAt, locale),
                  end: formatDateTime(active.endAt, locale),
                  cleanup: formatDateTime(active.cleanupAt, locale),
                  runners: active._count.starts,
                  onsite: active._count.onsites,
                })}
              </p>
              {canWrite ? (
                <div className="flex flex-wrap gap-3">
                  {active.status === "running" ? (
                    <form action={endTestModeNowAction}>
                      <input type="hidden" name="runId" value={active.id} />
                      <Button type="submit" variant="outline" className="h-10">
                        {t("endNow")}
                      </Button>
                    </form>
                  ) : null}
                  <form action={cleanupTestModeNowAction}>
                    <input type="hidden" name="runId" value={active.id} />
                    <Button type="submit" variant="outline" className="h-10">
                      {t("cleanupNow")}
                    </Button>
                  </form>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm text-race-muted">{t("noActive")}</p>
              {canWrite ? (
                <form action={startTestModeNowAction}>
                  <Button
                    type="submit"
                    className="h-10 w-fit bg-race-accent-solid font-semibold text-white hover:bg-race-accent-solid-hover"
                  >
                    {t("startNow")}
                  </Button>
                </form>
              ) : null}
            </>
          )}
        </fieldset>

        <fieldset className={box} data-testid="testmode-config">
          <legend className={legend}>{t("configTitle")}</legend>
          <form action={saveTestModeConfigAction} className="grid gap-4">
            <fieldset disabled={!canWrite} className="grid gap-4">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="enabled" defaultChecked={config.enabled} />
                {t("enabled")}
              </label>
              <div className="grid gap-1.5">
                <Label htmlFor="fictionalRunners">{t("fictionalRunners")}</Label>
                <Input
                  id="fictionalRunners"
                  name="fictionalRunners"
                  type="number"
                  min={0}
                  max={FICTIONAL_MAX}
                  step={1}
                  defaultValue={config.fictionalRunners}
                  className="h-10 w-28 bg-race-surface"
                />
                <p className="text-xs text-race-muted">{t("fictionalRunnersHint")}</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="copyLiveFrom">{t("copyLiveFrom")}</Label>
                <Input
                  id="copyLiveFrom"
                  name="copyLiveFrom"
                  type="text"
                  maxLength={5}
                  pattern="\d{2}-\d{2}"
                  defaultValue={config.copyLiveFrom}
                  className="h-10 w-28 bg-race-surface"
                />
                <p className="text-xs text-race-muted">{t("copyLiveFromHint")}</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="times">{t("times")}</Label>
                <Input
                  id="times"
                  name="times"
                  type="text"
                  maxLength={60}
                  defaultValue={config.times.join(", ")}
                  className="h-10 w-56 bg-race-surface"
                />
                <p className="text-xs text-race-muted">{t("timesHint")}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="blockBeforeRace"
                  defaultChecked={config.blockBeforeRace}
                />
                {t("blockBeforeRace")}
              </label>
              <div className="flex flex-wrap gap-6">
                <div className="grid gap-1.5">
                  <Label htmlFor="durationH">{t("durationH")}</Label>
                  <Input
                    id="durationH"
                    name="durationH"
                    type="number"
                    min={1}
                    max={6}
                    step={1}
                    defaultValue={config.durationH}
                    className="h-10 w-28 bg-race-surface"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cleanupAfterH">{t("cleanupAfterH")}</Label>
                  <Input
                    id="cleanupAfterH"
                    name="cleanupAfterH"
                    type="number"
                    min={1}
                    max={24}
                    step={1}
                    defaultValue={config.cleanupAfterH}
                    className="h-10 w-28 bg-race-surface"
                  />
                </div>
              </div>
              <p className="text-xs text-race-muted">{t("durationHint")}</p>
              {canWrite ? (
                <Button
                  type="submit"
                  className="h-10 w-fit bg-race-accent-solid font-semibold text-white hover:bg-race-accent-solid-hover"
                >
                  {admin("save")}
                </Button>
              ) : null}
            </fieldset>
          </form>
        </fieldset>

        <fieldset className={box}>
          <legend className={legend}>{t("fixedTitle")}</legend>
          <ul className="list-disc pl-5 text-sm text-race-muted">
            {fixed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </fieldset>

        <fieldset className={box} data-testid="testmode-runs">
          <legend className={legend}>{t("runsTitle")}</legend>
          {runs.length === 0 ? (
            <p className="text-sm text-race-muted">{t("runsEmpty")}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-race-muted">
                <tr>
                  <th className="py-1 pr-3">{t("runZero")}</th>
                  <th className="py-1 pr-3">{t("runStatus")}</th>
                  <th className="py-1 pr-3">{t("runRoster")}</th>
                  <th className="py-1 pr-3">{t("runCounts")}</th>
                  <th className="py-1 pr-3">{t("runCleanup")}</th>
                  <th className="py-1">{t("runReport")}</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-t border-race-line/40">
                    <td className="py-1 pr-3">{formatDateTime(run.zeroAt, locale)}</td>
                    <td className="py-1 pr-3">{run.status}</td>
                    <td className="py-1 pr-3">{run.roster}</td>
                    <td className="py-1 pr-3 tabular-nums">
                      {run._count.starts} / {run._count.onsites}
                    </td>
                    <td className="py-1 pr-3">{formatDateTime(run.cleanupAt, locale)}</td>
                    <td className="py-1">
                      <ReportCell report={run.report} t={t} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </fieldset>
      </div>
    </main>
  );
}

function parseReport(raw: string | null): TestReport | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TestReport;
  } catch {
    return null;
  }
}

/** Report po testu (jen v administraci): souhrn a prvních 30 problémů. */
function ReportCell({
  report: raw,
  t,
}: Readonly<{
  report: string | null;
  t: Awaited<ReturnType<typeof getTranslations<"TestMode">>>;
}>) {
  const report = parseReport(raw);
  if (!report) return <span className="text-race-muted">–</span>;
  return (
    <details>
      <summary className={report.ok ? "text-race-accent" : "text-red-600 dark:text-red-400"}>
        {t("reportSummary", {
          roster: report.roster,
          started: report.started,
          finished: report.finished,
          issues: report.issues.length,
        })}
      </summary>
      <p className="mt-1 text-xs text-race-muted">
        {t("reportCounts", {
          onsite: report.onsite,
          splits: report.splits,
          punches: report.punches,
          bibs: report.finishBibs,
        })}
      </p>
      {report.issues.length > 0 ? (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {report.issues.slice(0, 30).map((issue, index) => (
            <li key={index}>
              {t(`issue.${issue.kind}` as "issue.missing_split", {
                bib: issue.bib,
                split: "split" in issue ? issue.split : "",
              })}
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
