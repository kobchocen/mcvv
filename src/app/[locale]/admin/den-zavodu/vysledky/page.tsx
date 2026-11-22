import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvTestRunBanner } from "@/components/organisms/mcvv-test-run-banner";
import { Link, type Locale } from "@/i18n/routing";
import { canAccess, requireSection } from "@/lib/admin/access";
import { formatRaceTime } from "@/lib/live/start-time";
import { loadOfficialState } from "@/lib/race/official";
import {
  liveWindowAction,
  officialCheckAction,
  officialPublishAction,
} from "@/lib/race/official-actions";
import { officialResultsPath, type OfficialIssue } from "@/lib/race/official-core";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "OfficialAdmin" });
  return { title: t("title") };
}

const box = "grid gap-4 border border-race-line/60 bg-race-surface/40 p-5";
const heading = "font-display text-xl font-semibold";
const button =
  "inline-flex h-10 items-center border border-race-line bg-race-surface px-4 text-sm font-semibold hover:border-race-accent/60 disabled:opacity-50";
const primary =
  "inline-flex h-11 items-center border border-race-accent bg-race-accent px-5 text-sm font-bold text-white hover:opacity-90";

const ERRORS = [
  "confirm",
  "changed",
  "published",
  "has_results",
  "empty",
  "no_check",
  "stale_check",
  "test_running",
  "invalid",
] as const;
type ErrorKey = (typeof ERRORS)[number];
const SAVED = ["checked", "published", "window-auto", "window-open", "window-closed"] as const;
type SavedKey = (typeof SAVED)[number];

function isOneOf<T extends string>(list: readonly T[], value: string | undefined): value is T {
  return value !== undefined && (list as readonly string[]).includes(value);
}

/** Oficiální výsledky (#337): kontrola hlavním rozhodčím, zveřejnění a okno živých výsledků. */
export default async function OfficialResultsAdminPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const sp = await searchParams;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireSection("raceControl.official", "read");
  const [canPublish, canCheck, canWindow] = await Promise.all([
    canAccess("raceControl.official", "write"),
    canAccess("raceControl.officialCheck", "write"),
    canAccess("raceControl.live", "write"),
  ]);
  const t = await getTranslations({ locale, namespace: "OfficialAdmin" });
  const state = await loadOfficialState();
  const { preview, check, published, block, window } = state;
  const dateTime = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "cs-CZ", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Prague",
  });
  const when = (iso: string) => dateTime.format(new Date(iso));
  const checkValid = check !== null && check.hash === preview.hash;
  const names = new Map(preview.rows.map((row) => [row.bib, row.runnerName]));
  const issueText = (issue: OfficialIssue) => {
    const time = "time" in issue ? formatRaceTime(issue.time) : "";
    return t(`issue.${issue.kind}`, { bib: issue.bib, time, name: names.get(issue.bib) ?? "" });
  };

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl gap-8">
        <div>
          <McvvTestRunBanner locale={locale} leftovers className="mb-4" />
          <p className="mt-2 text-sm">
            <Link href="/admin/den-zavodu" className="text-race-accent hover:underline">
              ← {t("back")}
            </Link>
          </p>
          <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
            {t("heading", { year: state.year })}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{t("intro")}</p>
          {isOneOf(ERRORS, sp.error) ? (
            <p className="mt-4 border border-red-500/60 p-3 text-sm text-red-600 dark:text-red-400">
              {t(`error.${sp.error as ErrorKey}`)}
            </p>
          ) : null}
          {isOneOf(SAVED, sp.saved) ? (
            <p className="mt-4 border border-race-accent/60 p-3 text-sm">
              {t(`saved.${sp.saved as SavedKey}`)}
            </p>
          ) : null}
        </div>

        <section className={box} data-testid="live-window">
          <h2 className={heading}>{t("windowTitle")}</h2>
          <p className="text-sm">
            {t(`windowState.${window.state}`)} · {t(`windowMode.${window.mode}`)}
          </p>
          <p className="text-sm text-race-muted">{t("windowIntro")}</p>
          {canWindow && window.state !== "published" ? (
            <form action={liveWindowAction} className="flex flex-wrap gap-3">
              {(["auto", "open", "closed"] as const).map((mode) => (
                <button
                  key={mode}
                  type="submit"
                  name="mode"
                  value={mode}
                  className={button}
                  disabled={window.mode === mode}
                >
                  {t(`windowSet.${mode}`)}
                </button>
              ))}
            </form>
          ) : null}
        </section>

        <section className={box} data-testid="official-preview">
          <h2 className={heading}>{t("previewTitle")}</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-race-muted">{t("roster")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{preview.rosterCount}</dd>
            </div>
            <div>
              <dt className="text-race-muted">{t("finishers")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{preview.rows.length}</dd>
            </div>
            <div>
              <dt className="text-race-muted">{t("noFinish")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{preview.noFinish}</dd>
            </div>
            <div>
              <dt className="text-race-muted">{t("issues")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{preview.issues.length}</dd>
            </div>
          </dl>
          {preview.issues.length > 0 ? (
            <ul className="grid gap-1 text-sm text-amber-700 dark:text-amber-300">
              {preview.issues.map((issue) => (
                <li key={`${issue.kind}-${issue.bib}`}>{issueText(issue)}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-sm">
            <Link href="/admin/den-zavodu/zive/cil" className="text-race-accent hover:underline">
              {t("toFinish")}
            </Link>
          </p>
          {preview.rows.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                {t("rowsToggle", { count: preview.rows.length })}
              </summary>
              <table className="mt-3 w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-race-muted">
                    <th className="py-1 pr-3">#</th>
                    <th className="py-1 pr-3">{t("colBib")}</th>
                    <th className="py-1 pr-3">{t("colName")}</th>
                    <th className="py-1 pr-3">{t("colCategory")}</th>
                    <th className="py-1 pr-3">{t("colClub")}</th>
                    <th className="py-1">{t("colTime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, index) => (
                    <tr key={row.bib} className="border-t border-race-line/40">
                      <td className="py-1 pr-3">{index + 1}</td>
                      <td className="py-1 pr-3">{row.bib}</td>
                      <td className="py-1 pr-3">{row.runnerName}</td>
                      <td className="py-1 pr-3">{row.categoryId}</td>
                      <td className="py-1 pr-3">{row.clubName}</td>
                      <td className="py-1">{formatRaceTime(row.time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}
        </section>

        <section className={box} data-testid="official-check">
          <h2 className={heading}>{t("checkTitle")}</h2>
          <p className="text-sm">
            {check
              ? t(checkValid ? "checkDone" : "checkStale", { by: check.by, at: when(check.at) })
              : t("checkNone")}
          </p>
          {canCheck && !published && preview.rows.length > 0 && !checkValid ? (
            <form action={officialCheckAction}>
              <input type="hidden" name="hash" value={preview.hash} />
              <button type="submit" className={button}>
                {t("checkSubmit", { count: preview.rows.length })}
              </button>
            </form>
          ) : null}
        </section>

        <section className={box} data-testid="official-publish">
          <h2 className={heading}>{t("publishTitle")}</h2>
          {published ? (
            <p className="text-sm">
              {t("publishedInfo", {
                by: published.by,
                at: when(published.at),
                count: published.count,
              })}{" "}
              <Link
                href={officialResultsPath(state.year) as never}
                className="text-race-accent hover:underline"
              >
                {t("toResults")}
              </Link>
            </p>
          ) : block ? (
            <p className="text-sm text-race-muted">{t(`error.${block}`)}</p>
          ) : canPublish ? (
            <form action={officialPublishAction} className="grid gap-3">
              <p className="text-sm text-race-muted">{t("publishIntro")}</p>
              <input type="hidden" name="hash" value={preview.hash} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirm" value="1" required />
                {t("publishConfirm", { count: preview.rows.length })}
              </label>
              <div>
                <button type="submit" className={primary}>
                  {t("publishSubmit")}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-race-muted">{t("publishNoRight")}</p>
          )}
        </section>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
