import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvResultboardSettings } from "@/components/organisms/mcvv-resultboard-settings";
import { McvvTestRunBanner } from "@/components/organisms/mcvv-test-run-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link, type Locale } from "@/i18n/routing";
import { requireStaff } from "@/lib/admin/staff";
import { canManageLiveResults } from "@/lib/auth/roles";
import { formatStartClock } from "@/lib/date/race-schedule";
import { currentRaceYear } from "@/lib/entries/year";
import { formatDateTime } from "@/lib/format/date";
import {
  resolveConflictAction,
  saveRaceSetupAction,
  saveSplitmakerStationsAction,
  saveStarterSettingsAction,
} from "@/lib/live/admin-actions";
import { listSplitmakers } from "@/lib/live/assignment";
import { parseAssignment } from "@/lib/live/assignment-core";
import { OUTCOME_LABELS_CS, toPragueLocalInput } from "@/lib/live/admin-core";
import { raceDayOverview } from "@/lib/live/ingest";
import { loadOnlineSnapshot } from "@/lib/live/online-results";
import { getRaceContext, getStations } from "@/lib/live/race-context";
import { loadBoardPartners, loadResultboardConfig } from "@/lib/live/resultboard";
import { DEFAULT_DNS_GRACE_FALLBACK_S, DEFAULT_DNS_GRACE_S } from "@/lib/live/online-results-core";
import {
  DEFAULT_START_OFFSET_LIMIT_S,
  formatStartOffsetLimit,
} from "@/lib/live/splits-screen-core";
import { formatRaceTime } from "@/lib/live/start-time";
import { loadStarterSettings } from "@/lib/live/starter";
import { STARTER_SOUND_MODES } from "@/lib/live/starter-core";
import { FINISH_SPLIT, formatStations, LIVE_STATIONS_MAX, withStart } from "@/lib/live/stations";
import {
  getActiveTestRun,
  getTestCutoff,
  testRunBlocked,
  TEST_ZERO_CHOICES,
} from "@/lib/live/test-run";
import { endTestRunAction, startTestRunAction } from "@/lib/live/test-run-actions";
import { getSiteSettings } from "@/lib/settings/site";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    saved?: string;
    error?: string;
    test?: string;
    testError?: string;
  }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "LiveResults" });
  return { title: t("title") };
}

const box = "grid gap-4 border border-race-line/60 bg-race-surface/40 p-4";
const legend = "px-1 font-display text-lg font-semibold";

export default async function RaceDayPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const { saved, error, test, testError } = await searchParams;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const session = await requireStaff();
  const t = await getTranslations({ locale, namespace: "LiveResults" });
  const admin = await getTranslations({ locale, namespace: "Admin" });
  // Q143: nastavení resultboardu smí i pořadatel – ten vidí jen tuto sekci.
  if (!canManageLiveResults(session.role)) {
    return (
      <main className="px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-4xl gap-8">
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
              {t("title")}
            </h1>
            {error === "resultboard" ? (
              <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
                {t("error.resultboard")}
              </p>
            ) : saved === "resultboard" ? (
              <p role="status" className="mt-4 text-sm text-race-accent">
                {t("resultboardSaved")}
              </p>
            ) : null}
          </div>
          <ResultboardSection locale={locale} />
        </div>
      </main>
    );
  }
  const tt = await getTranslations({ locale, namespace: "TestRun" });
  // Test nejdřív: vypršelý se tady ukončí a uklidí, zbytek stránky pak čte čistý stav.
  const [testRun, testCutoff] = await Promise.all([getActiveTestRun(), getTestCutoff()]);
  const ctx = await getRaceContext();
  // Nulový čas ročníku (st_nula_s) pro nápovědy a předvolbu testu.
  const zeroClock = formatStartClock((await currentRaceYear()).startModel.zeroSeconds);
  const [stations, overview, site, splitmakers, starter] = await Promise.all([
    getStations(),
    raceDayOverview(ctx.year),
    getSiteSettings(),
    listSplitmakers(),
    loadStarterSettings(),
  ]);
  const now = new Date();
  const testBlocked = testRunBlocked(now, testCutoff);
  // Q116: web vede na vlastní /vysledky/online, ručně zadaná URL je nouzové přebití
  const onlineOverride = site.onlineResultsUrl;
  const fmt = (date: Date | null | undefined) => (date ? formatDateTime(date, locale) : "–");
  const stationName = (code: string) =>
    code === FINISH_SPLIT ? t("finish") : (stations.find((s) => s.code === code)?.label ?? code);

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-4xl gap-8">
        <div>
          <McvvTestRunBanner locale={locale} leftovers className="mb-4" />
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {t("title")} {ctx.year}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-race-muted">
            {t("intro", { zero: fmt(ctx.zero) })}
            {ctx.zeroOverridden ? ` ${t("zeroOverridden")}` : ""}
          </p>
          <p className="mt-3 flex flex-wrap gap-4 text-sm">
            <Link href="/mezicasy" className="font-medium text-race-accent hover:underline">
              {t("openSplits")}
            </Link>
            <Link
              href="/admin/den-zavodu/zive/casy"
              className="font-medium text-race-accent hover:underline"
              data-testid="open-splits-admin"
            >
              {t("openSplitsAdmin")}
            </Link>
            <Link
              href="/admin/den-zavodu/start"
              className="font-medium text-race-accent hover:underline"
              data-testid="open-start-check"
            >
              {t("openStartCheck")}
            </Link>
            <Link
              href="/resultboard"
              className="font-medium text-race-accent hover:underline"
              data-testid="open-resultboard"
            >
              {t("openResultboard")}
            </Link>
          </p>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {t(`error.${error}` as never)}
            </p>
          ) : saved ? (
            <p role="status" className="mt-4 text-sm text-race-accent">
              {t(saved === "resultboard" ? "resultboardSaved" : "saved")}
            </p>
          ) : null}
        </div>

        <fieldset className={`${box} ${testRun ? "border-amber-500" : ""}`} data-testid="test-run">
          <legend className={legend}>{tt("title")}</legend>
          <p className="text-sm text-race-muted">{tt("intro", { cutoff: fmt(testCutoff) })}</p>
          {testError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {tt(`error.${testError}` as never)}
            </p>
          ) : test ? (
            <p role="status" className="text-sm text-race-accent" data-testid="test-run-result">
              {tt(`done.${test}` as never)}
            </p>
          ) : null}
          {testRun ? (
            <div className="grid gap-3">
              <p className="font-semibold" data-testid="test-run-active">
                {tt("active", { zero: fmt(testRun.zero), expires: fmt(testRun.expiresAt) })}
              </p>
              <form action={endTestRunAction} className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="destructive" className="h-10 font-semibold">
                  {tt("end")}
                </Button>
                <span className="text-xs text-race-muted">{tt("endHint")}</span>
              </form>
            </div>
          ) : testBlocked ? (
            <p className="text-sm font-semibold">{tt("blocked", { cutoff: fmt(testCutoff) })}</p>
          ) : (
            <form action={startTestRunAction} className="grid gap-3">
              <fieldset className="flex flex-wrap items-center gap-4 text-sm">
                <legend className="mb-2 text-sm font-medium">{tt("zeroLabel")}</legend>
                {TEST_ZERO_CHOICES.map((choice, index) => (
                  <label key={choice} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="zeroChoice"
                      value={choice}
                      defaultChecked={index === 0}
                      className="size-4"
                    />
                    {choice === "atZero"
                      ? tt("zeroAtStart", { time: zeroClock })
                      : tt(
                          choice === "in5"
                            ? "zeroIn5"
                            : choice === "at2015"
                              ? "zeroAt2015"
                              : "zeroCustom",
                        )}
                  </label>
                ))}
                <Input
                  name="zeroCustom"
                  type="datetime-local"
                  step={1}
                  aria-label={tt("zeroCustom")}
                  className="h-9 w-fit bg-race-surface"
                />
              </fieldset>
              <Button
                type="submit"
                className="h-10 w-fit bg-race-accent-solid font-semibold text-white hover:bg-race-accent-solid-hover"
              >
                {tt("start")}
              </Button>
            </form>
          )}
        </fieldset>

        <fieldset className={box}>
          <legend className={legend}>{t("splitsTitle")}</legend>
          <dl className="grid grid-cols-3 gap-3 text-center" data-testid="split-counts">
            {[...stations.map((s) => s.code), FINISH_SPLIT].map((code) => (
              <div key={code} className="border border-race-line/50 bg-race-surface p-3">
                <dt className="text-xs text-race-muted">{stationName(code)}</dt>
                <dd className="font-display text-2xl font-bold">
                  {overview.splitCounts[code] ?? 0}
                </dd>
              </div>
            ))}
          </dl>
          {overview.conflicts.length > 0 ? (
            <div className="grid gap-2">
              <h2 className="font-semibold text-red-600 dark:text-red-400">
                {t("conflicts", { count: overview.conflicts.length })}
              </h2>
              <p className="text-xs text-race-muted">{t("conflictsHint")}</p>
              <ul className="grid gap-2">
                {overview.conflicts.map((c) => {
                  const existing = /existing=(\d+)/.exec(c.note ?? "")?.[1];
                  return (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center gap-3 border border-red-500/40 p-2 text-sm"
                    >
                      <span className="font-semibold">
                        {t("conflictLine", {
                          bib: c.bib,
                          station: stationName(c.split),
                          existing: existing ? formatRaceTime(Number(existing)) : "?",
                          incoming: c.time !== null ? formatRaceTime(c.time) : "?",
                          author: c.author,
                        })}
                      </span>
                      <form action={resolveConflictAction} className="flex gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <Button
                          type="submit"
                          name="decision"
                          value="accept"
                          className="h-8 bg-race-accent-solid px-3 text-xs text-white"
                        >
                          {t("conflictAccept")}
                        </Button>
                        <Button
                          type="submit"
                          name="decision"
                          value="dismiss"
                          variant="outline"
                          className="h-8 px-3 text-xs"
                        >
                          {t("conflictDismiss")}
                        </Button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-race-muted">{t("noConflicts")}</p>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-semibold">{t("recent")}</summary>
            <table className="mt-2 w-full text-left text-xs">
              <thead className="text-race-muted">
                <tr>
                  <th className="py-1">{t("colTime")}</th>
                  <th>{t("colStation")}</th>
                  <th>{t("colBib")}</th>
                  <th>{t("colSplit")}</th>
                  <th>{t("colOutcome")}</th>
                  <th>{t("colAuthor")}</th>
                </tr>
              </thead>
              <tbody>
                {overview.recent.map((e) => (
                  <tr key={e.id} className="border-t border-race-line/40">
                    <td className="py-1">{fmt(e.receivedAt)}</td>
                    <td>{stationName(e.split)}</td>
                    <td>{e.bib || "–"}</td>
                    <td>{e.time !== null ? formatRaceTime(e.time) : "–"}</td>
                    <td>
                      {OUTCOME_LABELS_CS[e.outcome] ?? e.outcome}
                      {e.note ? <span className="text-race-muted"> ({e.note})</span> : null}
                    </td>
                    <td>{e.author}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </fieldset>

        <ResultboardSection locale={locale} />

        <fieldset className={box} data-testid="online-link">
          <legend className={legend}>{t("onlineLink")}</legend>
          <p className="text-sm text-race-muted">
            {onlineOverride ? (
              `${onlineOverride} (${t("onlineLinkOverride")})`
            ) : (
              <>
                <a
                  href={`/${locale}/vysledky/online`}
                  target="_blank"
                  rel="noopener"
                  className="underline underline-offset-2"
                >
                  /{locale}/vysledky/online
                </a>{" "}
                ({t("onlineLinkOwn")})
              </>
            )}
          </p>
        </fieldset>

        <fieldset className={box} data-testid="splitmakers">
          <legend className={legend}>{t("splitmakersTitle")}</legend>
          <p className="text-sm text-race-muted">{t("splitmakersIntro")}</p>
          {splitmakers.length === 0 ? (
            <p className="text-sm text-race-muted">{t("splitmakersEmpty")}</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {splitmakers.map((user) => {
                const assigned = parseAssignment(user.splitStations);
                return (
                  <li
                    key={user.id}
                    className="border border-race-line/50 p-2"
                    data-testid={`splitmaker-${user.id}`}
                  >
                    <form
                      action={saveSplitmakerStationsAction}
                      className="flex flex-wrap items-center gap-3"
                    >
                      <input type="hidden" name="userId" value={user.id} />
                      <span className="min-w-48">
                        <strong>{user.name}</strong>{" "}
                        <span className="text-xs text-race-muted">{user.email}</span>
                      </span>
                      {withStart(stations).map((station) => (
                        <label key={station.code} className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            name="stations"
                            value={station.code}
                            defaultChecked={assigned.includes(station.code)}
                            className="size-4"
                          />
                          {station.label}
                        </label>
                      ))}
                      {assigned.length === 0 ? (
                        <span className="text-xs text-amber-700 dark:text-amber-300">
                          {t("splitmakerNone")}
                        </span>
                      ) : null}
                      <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                        {admin("save")}
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        <fieldset className={box}>
          <legend className={legend}>{t("setupTitle")}</legend>
          <form action={saveRaceSetupAction} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="stations">{t("stations")}</Label>
              <Textarea
                id="stations"
                name="stations"
                maxLength={LIVE_STATIONS_MAX}
                defaultValue={formatStations(stations)}
                className="min-h-20 bg-race-surface font-mono text-sm"
              />
              <p className="text-xs text-race-muted">{t("stationsHint")}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="zeroOverride">{t("zeroOverride")}</Label>
              <Input
                id="zeroOverride"
                name="zeroOverride"
                type="datetime-local"
                step={1}
                defaultValue={ctx.zeroOverridden ? toPragueLocalInput(ctx.zero) : ""}
                disabled={testRun !== null}
                className="h-10 w-fit bg-race-surface"
              />
              <p className="text-xs text-race-muted">
                {testRun ? tt("zeroLocked") : t("zeroOverrideHint", { time: zeroClock })}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="startLimit">{t("startLimit")}</Label>
              <Input
                id="startLimit"
                name="startLimit"
                type="text"
                inputMode="text"
                maxLength={32}
                placeholder={formatStartOffsetLimit(DEFAULT_START_OFFSET_LIMIT_S)}
                defaultValue={formatStartOffsetLimit(ctx.startLimitS)}
                data-testid="start-limit-input"
                className="h-10 w-40 bg-race-surface"
              />
              <p className="text-xs text-race-muted">{t("startLimitHint")}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dnsGrace">{t("dnsGrace")}</Label>
              <Input
                id="dnsGrace"
                name="dnsGrace"
                type="text"
                inputMode="text"
                maxLength={32}
                placeholder={formatStartOffsetLimit(DEFAULT_DNS_GRACE_S)}
                defaultValue={formatStartOffsetLimit(ctx.dnsGraceS)}
                data-testid="dns-grace-input"
                className="h-10 w-40 bg-race-surface"
              />
              <p className="text-xs text-race-muted">{t("dnsGraceHint")}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dnsGraceFallback">{t("dnsGraceFallback")}</Label>
              <Input
                id="dnsGraceFallback"
                name="dnsGraceFallback"
                type="text"
                inputMode="text"
                maxLength={32}
                placeholder={formatStartOffsetLimit(DEFAULT_DNS_GRACE_FALLBACK_S)}
                defaultValue={formatStartOffsetLimit(ctx.dnsGraceFallbackS)}
                data-testid="dns-grace-fallback-input"
                className="h-10 w-40 bg-race-surface"
              />
              <p className="text-xs text-race-muted">{t("dnsGraceFallbackHint")}</p>
            </div>
            <Button
              type="submit"
              className="h-10 w-fit bg-race-accent-solid font-semibold text-white hover:bg-race-accent-solid-hover"
            >
              {admin("save")}
            </Button>
          </form>
        </fieldset>

        <fieldset className={box} id="starter" data-testid="starter-settings">
          <legend className={legend}>{t("starterTitle")}</legend>
          <p className="text-sm text-race-muted">
            {t("starterIntro")}{" "}
            <Link href="/start" className="font-medium text-race-accent hover:underline">
              {t("starterOpen")}
            </Link>
          </p>
          <form action={saveStarterSettingsAction} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="starterSound">{t("starterSound")}</Label>
              <select
                id="starterSound"
                name="starterSound"
                defaultValue={starter.sound}
                className="h-10 w-fit border border-race-line bg-race-surface px-2 text-sm"
              >
                {STARTER_SOUND_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`starterSoundMode.${mode}`)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-race-muted">{t("starterSoundHint")}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="starterRedPhase">{t("starterRedPhase")}</Label>
              <Input
                id="starterRedPhase"
                name="starterRedPhase"
                type="number"
                min={0}
                max={120}
                step={1}
                defaultValue={starter.redPhaseS}
                className="h-10 w-28 bg-race-surface"
              />
              <p className="text-xs text-race-muted">{t("starterRedPhaseHint")}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="starterDnsWindow">{t("starterDnsWindow")}</Label>
              <Input
                id="starterDnsWindow"
                name="starterDnsWindow"
                type="text"
                maxLength={32}
                defaultValue={formatStartOffsetLimit(starter.dnsWindowS)}
                className="h-10 w-40 bg-race-surface"
              />
              <p className="text-xs text-race-muted">{t("starterDnsWindowHint")}</p>
            </div>
            <Button
              type="submit"
              className="h-10 w-fit bg-race-accent-solid font-semibold text-white hover:bg-race-accent-solid-hover"
            >
              {admin("save")}
            </Button>
          </form>
        </fieldset>
      </div>
    </main>
  );
}

/**
 * Sekce „Resultboard – obrazovky v cíli“ (#188, Q143): odkazy na TV a nastavení. Počty
 * běžců bere ze stejného snímku jako obrazovky (vč. testovacího běhu, ať náhled sedí).
 */
async function ResultboardSection({ locale }: Readonly<{ locale: Locale }>) {
  const t = await getTranslations({ locale, namespace: "ResultboardSettings" });
  const [config, partners, snapshot] = await Promise.all([
    loadResultboardConfig(),
    loadBoardPartners(),
    loadOnlineSnapshot(new Date(), { includeTest: true }),
  ]);
  const counts = new Map<string, number>();
  for (const r of snapshot.runners) counts.set(r.cat, (counts.get(r.cat) ?? 0) + 1);
  const categories = snapshot.categories.map((c) => ({
    id: c.id,
    name: c.name,
    entries: counts.get(c.id) ?? 0,
  }));
  return (
    <fieldset className={box} id="resultboard" data-testid="resultboard-section">
      <legend className={legend}>{t("title")}</legend>
      <p className="text-sm leading-6 text-race-muted">{t("intro")}</p>
      <p className="flex flex-wrap gap-4 text-sm">
        <Link href="/resultboard" className="font-medium text-race-accent hover:underline">
          {t("openIndex")}
        </Link>
        {config.monitors.map((m, i) => (
          <Link
            key={i}
            href={{ pathname: "/resultboard/[tv]", params: { tv: String(i + 1) } }}
            className="font-medium text-race-accent hover:underline"
          >
            {t("openTv", { n: i + 1, name: m.name })}
          </Link>
        ))}
        <Link
          href={{ pathname: "/resultboard/[tv]", params: { tv: "1" }, query: { test: "1" } }}
          className="font-medium text-race-accent hover:underline"
        >
          {t("openTest")}
        </Link>
      </p>
      <McvvResultboardSettings
        initial={config}
        categories={categories}
        partners={partners.map((p) => ({ id: p.id, name: p.name, general: p.general }))}
      />
    </fieldset>
  );
}

export const dynamic = "force-dynamic";
