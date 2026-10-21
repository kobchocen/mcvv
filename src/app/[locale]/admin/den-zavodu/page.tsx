import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { requireRaceDay } from "@/lib/admin/staff";
import { isStaffRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/client";
import { findEncodingIssues, firstClubRows, startWarnings } from "@/lib/raceday/obd-export";
import { cancelledStartRunnerIds, loadObdExportData } from "@/lib/raceday/obd-export-data";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "RaceDay" });
  return { title: t("title") };
}

const ACTION_KEYS: Record<
  string,
  "action_obd_export" | "action_import_presentation" | "action_import_results"
> = {
  "raceday.obd_export": "action_obd_export",
  "raceday.import_presentation": "action_import_presentation",
  "raceday.import_results": "action_import_results",
};

/** Stahování z route handleru (ne stránka) – proto obyčejný odkaz, ne <Link>. */
const EXPORT_URL = "/api/den-zavodu/obd-export";
function exportHref(query: string): string {
  return `${EXPORT_URL}?${query}`;
}

const buttonClass =
  "inline-flex h-10 items-center border border-race-line bg-race-surface px-4 text-sm font-semibold hover:border-race-accent/60";
const primaryClass =
  "inline-flex h-10 items-center bg-race-accent-solid px-4 font-display text-sm font-semibold text-white hover:bg-race-accent-solid-hover";

export default async function RaceDayPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const session = await requireRaceDay();
  const copy = await getTranslations({ locale, namespace: "RaceDay" });
  const admin = await getTranslations({ locale, namespace: "Admin" });

  const data = await loadObdExportData();
  const [cancelled, history] = await Promise.all([
    cancelledStartRunnerIds(data.year),
    prisma.auditLog.findMany({
      where: { action: { startsWith: "raceday." } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);
  const issues = findEncodingIssues(data);
  const warnings = startWarnings(data.starts, cancelled);
  const dateTime = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "cs-CZ", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Prague",
  });

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {isStaffRole(session.role) ? <McvvAdminHomeLink label={admin("title")} /> : null}
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("heading", { year: data.year })}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{copy("intro")}</p>

        <section
          className="mt-8 grid gap-4 border border-race-line/60 bg-race-surface/40 p-5"
          data-testid="obd-export"
        >
          <h2 className="font-display text-xl font-semibold">{copy("exportTitle")}</h2>
          <p className="text-sm leading-6 text-race-muted">{copy("exportIntro")}</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            {(
              [
                ["countCategories", data.categories.length],
                ["countClubs", firstClubRows(data.clubs).length],
                ["countRunners", data.runners.length],
                ["countStarts", data.starts.length],
              ] as const
            ).map(([key, value]) => (
              <div key={key}>
                <dt className="text-race-muted">{copy(key)}</dt>
                <dd className="font-display text-2xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          {data.starts.length === 0 ? (
            <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
              {copy("noStarts")}
            </p>
          ) : null}
          {warnings.length > 0 ? (
            <div role="status" className="text-sm text-amber-700 dark:text-amber-300">
              <p className="font-semibold">{copy("warningsTitle")}</p>
              <ul className="mt-1 list-disc pl-5">
                {warnings.map((warning) => (
                  <li key={`${warning.kind}-${warning.bib}`}>
                    {warning.kind === "duplicate_bib"
                      ? copy("warnDuplicateBib", {
                          bib: warning.bib,
                          runners: warning.runnerIds.join(", "),
                        })
                      : copy("warnCancelled", { bib: warning.bib, runner: warning.runnerId })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {issues.length > 0 ? (
            <div role="alert" className="text-sm text-red-700 dark:text-red-300">
              <p className="font-semibold">{copy("encodingTitle", { count: issues.length })}</p>
              <p className="mt-1">{copy("encodingHint")}</p>
              <table className="mt-2 w-full border-collapse text-left">
                <tbody>
                  {issues.map((issue) => (
                    <tr
                      key={`${issue.section}-${issue.id}`}
                      className="border-b border-race-line/40"
                    >
                      <td className="py-1 pr-3">#{issue.section}</td>
                      <td className="py-1 pr-3 font-mono">{issue.id}</td>
                      <td className="py-1 pr-3">{issue.name}</td>
                      <td className="py-1 pr-3 font-mono">{issue.chars.join(" ")}</td>
                      <td className="py-1">→ {issue.replacement}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-race-accent">{copy("encodingOk")}</p>
          )}
          <div className="flex flex-wrap gap-3">
            {issues.length === 0 ? (
              <>
                <a
                  className={primaryClass}
                  href={exportHref("format=txt")}
                  download
                  data-testid="obd-download-txt"
                >
                  {copy("downloadTxt")}
                </a>
                <a className={buttonClass} href={exportHref("format=html")} download>
                  {copy("downloadHtml")}
                </a>
              </>
            ) : (
              <>
                <a className={buttonClass} href={exportHref("format=txt&nahradit=1")} download>
                  {copy("downloadTxtReplaced")}
                </a>
                <a className={buttonClass} href={exportHref("format=html&nahradit=1")} download>
                  {copy("downloadHtmlReplaced")}
                </a>
              </>
            )}
          </div>
          <p className="text-xs leading-5 text-race-muted">{copy("formatNote")}</p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold">{copy("historyTitle")}</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-race-muted">{copy("historyEmpty")}</p>
          ) : (
            <ul className="mt-3 grid gap-1 text-sm text-race-muted" data-testid="raceday-history">
              {history.map((entry) => (
                <li key={entry.id}>
                  {dateTime.format(entry.createdAt)} – {entry.actorEmail} –{" "}
                  {copy(ACTION_KEYS[entry.action] ?? "action_other")} {entry.target ?? ""}
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
