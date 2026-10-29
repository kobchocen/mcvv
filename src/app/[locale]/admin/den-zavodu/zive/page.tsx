import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvAdminTokenForm } from "@/components/organisms/mcvv-admin-token-form";
import { McvvTestRunBanner } from "@/components/organisms/mcvv-test-run-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link, type Locale } from "@/i18n/routing";
import { requireAdmin } from "@/lib/admin/staff";
import { formatDateTime } from "@/lib/format/date";
import {
  createTokenAction,
  publishNowAction,
  resolveConflictAction,
  revokeTokenAction,
  saveOfeedAction,
  switchOfeedProfileAction,
  saveRaceSetupAction,
  saveSplitmakerStationsAction,
} from "@/lib/live/admin-actions";
import { listSplitmakers } from "@/lib/live/assignment";
import { parseAssignment } from "@/lib/live/assignment-core";
import { defaultTokenWindow, OUTCOME_LABELS_CS, toPragueLocalInput } from "@/lib/live/admin-core";
import { raceDayOverview } from "@/lib/live/ingest";
import { getRaceContext, getStations } from "@/lib/live/race-context";
import { DEFAULT_DNS_GRACE_FALLBACK_S, DEFAULT_DNS_GRACE_S } from "@/lib/live/online-results-core";
import {
  DEFAULT_START_OFFSET_LIMIT_S,
  formatStartOffsetLimit,
} from "@/lib/live/splits-screen-core";
import { formatRaceTime } from "@/lib/live/start-time";
import { FINISH_SPLIT, formatStations, LIVE_STATIONS_MAX, withStart } from "@/lib/live/stations";
import {
  getActiveTestRun,
  getTestCutoff,
  testRunBlocked,
  TEST_ZERO_CHOICES,
} from "@/lib/live/test-run";
import { endTestRunAction, startTestRunAction } from "@/lib/live/test-run-actions";
import { listDeviceTokens } from "@/lib/live/tokens";
import { tokenState } from "@/lib/live/tokens-core";
import { ofeedStatus } from "@/lib/ofeed/publisher";
import {
  getOfeedSettings,
  OFEED_BOARD_URL,
  ofeedPublicUrl,
  passwordExpiresAt,
  onlineResultsOverrideUrl,
} from "@/lib/ofeed/settings";
import { getSiteSettings } from "@/lib/settings/site";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    saved?: string;
    error?: string;
    published?: string;
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
  const { saved, error, published, test, testError } = await searchParams;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireAdmin();
  const t = await getTranslations({ locale, namespace: "LiveResults" });
  const tt = await getTranslations({ locale, namespace: "TestRun" });
  const admin = await getTranslations({ locale, namespace: "Admin" });
  // Test nejdřív: vypršelý se tady ukončí a uklidí, zbytek stránky pak čte čistý stav.
  const [testRun, testCutoff] = await Promise.all([getActiveTestRun(), getTestCutoff()]);
  const ctx = await getRaceContext();
  const [stations, ofeed, status, tokens, overview, site, splitmakers] = await Promise.all([
    getStations(),
    getOfeedSettings(),
    ofeedStatus(),
    listDeviceTokens(ctx.year),
    raceDayOverview(ctx.year),
    getSiteSettings(),
    listSplitmakers(),
  ]);
  const now = new Date();
  const testBlocked = testRunBlocked(now, testCutoff);
  const testOfeedReady = ofeed.profile === "test" && Boolean(ofeed.profiles.test.eventId);
  const window = defaultTokenWindow(ctx.zero);
  // Q116: web vede na vlastní /vysledky/online, ručně zadaná URL je nouzové přebití
  const onlineOverride = onlineResultsOverrideUrl(site.onlineResultsUrl, ofeed);
  const fmt = (date: Date | null | undefined) => (date ? formatDateTime(date, locale) : "–");
  const stationName = (code: string) =>
    code === FINISH_SPLIT ? t("finish") : (stations.find((s) => s.code === code)?.label ?? code);

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-4xl gap-8">
        <div>
          <McvvAdminHomeLink label={admin("title")} />
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
            <a
              href={OFEED_BOARD_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-race-accent hover:underline"
            >
              {t("openBoard")}
            </a>
            {ofeed.eventId ? (
              <a
                href={ofeedPublicUrl(ofeed.eventId)}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-race-accent hover:underline"
              >
                {t(ofeed.profile === "test" ? "openOfeedTest" : "openOfeed")}
              </a>
            ) : null}
          </p>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {t(`error.${error}` as never)}
            </p>
          ) : saved ? (
            <p role="status" className="mt-4 text-sm text-race-accent">
              {t("saved")}
            </p>
          ) : published ? (
            <p role="status" className="mt-4 text-sm text-race-accent" data-testid="publish-result">
              {t(`publish.${published}` as never)}
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
              <p className="text-xs text-race-muted">{tt("tokenHint")}</p>
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
              {!testOfeedReady ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">{tt("requiresOfeed")}</p>
              ) : null}
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
                    {tt(
                      choice === "in5"
                        ? "zeroIn5"
                        : choice === "at1015"
                          ? "zeroAt1015"
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
                disabled={!testOfeedReady}
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

        <fieldset className={box}>
          <legend className={legend}>{t("ofeedTitle")}</legend>
          <p className="text-sm text-race-muted">{t("ofeedIntro")}</p>
          {status.dryRun ? (
            <p
              className="border border-amber-500/60 bg-amber-500/10 p-2 text-sm"
              data-testid="ofeed-dry-run"
            >
              {t("ofeedDryRun")}
            </p>
          ) : null}
          <div
            className={
              ofeed.profile === "test"
                ? "grid gap-2 border border-amber-500/60 bg-amber-500/10 p-3 text-sm"
                : "grid gap-2 border border-race-line/60 p-3 text-sm"
            }
            data-testid="ofeed-profile"
            data-profile={ofeed.profile}
          >
            <p>
              <strong>{t(`ofeedProfileActive.${ofeed.profile}`)}</strong>{" "}
              {ofeed.eventId ? <code className="text-xs">{ofeed.eventId}</code> : null}
            </p>
            <p className="text-race-muted">{t(`ofeedProfileHint.${ofeed.profile}`)}</p>
            <form action={switchOfeedProfileAction}>
              <input
                type="hidden"
                name="profile"
                value={ofeed.profile === "test" ? "live" : "test"}
              />
              <Button
                type="submit"
                variant="outline"
                className="h-9"
                data-testid="ofeed-profile-switch"
                disabled={testRun !== null && ofeed.profile === "test"}
                title={
                  testRun !== null && ofeed.profile === "test" ? t("error.ofeedTestRun") : undefined
                }
              >
                {t(ofeed.profile === "test" ? "ofeedSwitchToLive" : "ofeedSwitchToTest")}
              </Button>
            </form>
          </div>
          <form action={saveOfeedAction} className="grid gap-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={ofeed.enabled}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="font-medium">{t("ofeedEnabled")}</span>
                <span className="mt-1 block text-race-muted">{t("ofeedEnabledHint")}</span>
              </span>
            </label>
            {(["live", "test"] as const).map((profile) => {
              const data = ofeed.profiles[profile];
              const prefix = profile === "test" ? "test" : "";
              const name = (field: string) =>
                prefix ? `${prefix}${field[0].toUpperCase()}${field.slice(1)}` : field;
              const until = passwordExpiresAt(data.passwordSetAt);
              return (
                <fieldset
                  key={profile}
                  className="grid gap-3 border border-race-line/50 p-3"
                  data-testid={`ofeed-fields-${profile}`}
                >
                  <legend className="px-1 text-sm font-semibold">
                    {t(`ofeedProfileName.${profile}`)}
                    {ofeed.profile === profile ? ` · ${t("ofeedProfileCurrent")}` : ""}
                  </legend>
                  <div className="grid gap-1.5">
                    <Label htmlFor={name("eventId")}>{t("ofeedEventId")}</Label>
                    <Input
                      id={name("eventId")}
                      name={name("eventId")}
                      defaultValue={data.eventId ?? ""}
                      maxLength={64}
                      autoComplete="off"
                      className="h-10 bg-race-surface font-mono"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor={name("password")}>{t("ofeedPassword")}</Label>
                    <Input
                      id={name("password")}
                      name={name("password")}
                      type="password"
                      autoComplete="new-password"
                      maxLength={200}
                      placeholder={data.hasPassword ? t("ofeedPasswordKeep") : ""}
                      className="h-10 bg-race-surface"
                    />
                    <p
                      className="text-xs text-race-muted"
                      data-testid={
                        profile === "live" ? "ofeed-password-state" : "ofeed-test-password-state"
                      }
                    >
                      {data.hasPassword
                        ? t("ofeedPasswordSet", { at: fmt(data.passwordSetAt), until: fmt(until) })
                        : t("ofeedPasswordMissing")}
                      {until && until < now ? ` ${t("ofeedPasswordExpired")}` : ""}
                    </p>
                    {data.hasPassword ? (
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" name={name("clearPassword")} className="size-4" />{" "}
                        {t("ofeedPasswordClear")}
                      </label>
                    ) : null}
                  </div>
                </fieldset>
              );
            })}
            <Button
              type="submit"
              className="h-10 w-fit bg-race-accent-solid font-semibold text-white hover:bg-race-accent-solid-hover"
            >
              {admin("save")}
            </Button>
          </form>
          <div className="grid gap-2 text-sm" data-testid="ofeed-status">
            <p>
              {t("ofeedLastOk")}: <strong>{fmt(status.lastOkAt)}</strong>
            </p>
            {status.lastError ? (
              <p className="text-red-600 dark:text-red-400">
                {t("ofeedLastError")}: {fmt(status.lastError.startedAt)} – {status.lastError.error}
              </p>
            ) : null}
            <p className="text-race-muted">
              {t("onlineLink")}:{" "}
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
              {ofeed.profile === "test" && site.onlineResultsUrl && !onlineOverride
                ? ` ${t("onlineLinkHiddenTest")}`
                : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={publishNowAction}>
                <Button type="submit" variant="outline" className="h-9">
                  {t("publishNow")}
                </Button>
              </form>
              <form method="get" action="/api/admin/ofeed/xml">
                <Button type="submit" variant="outline" className="h-9">
                  {t("downloadXml")}
                </Button>
              </form>
            </div>
            {status.runs.length > 0 ? (
              <table className="mt-2 w-full text-left text-xs">
                <thead className="text-race-muted">
                  <tr>
                    <th className="py-1">{t("colTime")}</th>
                    <th>{t("colMode")}</th>
                    <th>{t("colCompetitors")}</th>
                    <th>{t("colOutcome")}</th>
                  </tr>
                </thead>
                <tbody>
                  {status.runs.map((run, index) => (
                    <tr key={index} className="border-t border-race-line/40">
                      <td className="py-1">{fmt(run.startedAt)}</td>
                      <td>{run.mode}</td>
                      <td>{run.fetched}</td>
                      <td>{run.ok === null ? "…" : run.ok ? "OK" : (run.error ?? "chyba")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </fieldset>

        <fieldset className={box}>
          <legend className={legend}>{t("devicesTitle")}</legend>
          <p className="text-sm text-race-muted">{t("devicesIntro", { year: ctx.year })}</p>
          {tokens.length > 0 ? (
            <ul className="grid gap-2 text-sm" data-testid="tokens">
              {tokens.map((token) => {
                const state = tokenState(token, now);
                return (
                  <li
                    key={token.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-race-line/50 p-2"
                  >
                    <span>
                      <strong>{token.label}</strong>{" "}
                      <code className="text-xs">{token.prefix}…</code> ·{" "}
                      {t("tokenSplitsShort", { splits: token.splits })} · {fmt(token.validFrom)} –{" "}
                      {fmt(token.validUntil)} · {t(`tokenState.${state}` as never)}
                      {token.lastUsedAt
                        ? ` · ${t("tokenLastUsed", { at: fmt(token.lastUsedAt) })}`
                        : ""}
                    </span>
                    {state !== "revoked" ? (
                      <form action={revokeTokenAction}>
                        <input type="hidden" name="id" value={token.id} />
                        <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                          {t("tokenRevoke")}
                        </Button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <McvvAdminTokenForm
            action={createTokenAction}
            defaultFrom={toPragueLocalInput(window.from)}
            defaultUntil={toPragueLocalInput(window.until)}
          />
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
                {testRun ? tt("zeroLocked") : t("zeroOverrideHint")}
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
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
