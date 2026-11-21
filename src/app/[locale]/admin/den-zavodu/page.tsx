import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvTestRunBanner } from "@/components/organisms/mcvv-test-run-banner";
import { canAccess, requireSection } from "@/lib/admin/access";
import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { Link, type Locale } from "@/i18n/routing";

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
  | "action_obd_export"
  | "action_import_presentation"
  | "action_import_results"
  | "action_splits_cleared"
  | "action_split_set"
  | "action_split_deleted"
  | "action_split_conflict_resolved"
  | "action_split_conflict_dismissed"
  | "action_ofeed_profile"
  | "action_start_set"
  | "action_start_deleted"
  | "action_starts_cleared"
> = {
  "raceday.obd_export": "action_obd_export",
  "raceday.import_presentation": "action_import_presentation",
  "raceday.import_results": "action_import_results",
  "raceday.splits_cleared": "action_splits_cleared",
  "raceday.split_set": "action_split_set",
  "raceday.split_deleted": "action_split_deleted",
  "raceday.split_conflict_resolved": "action_split_conflict_resolved",
  "raceday.split_conflict_dismissed": "action_split_conflict_dismissed",
  "raceday.ofeed_profile": "action_ofeed_profile",
  "raceday.start_set": "action_start_set",
  "raceday.start_deleted": "action_start_deleted",
  "raceday.starts_cleared": "action_starts_cleared",
};

const buttonClass =
  "inline-flex h-10 items-center border border-race-line bg-race-surface px-4 text-sm font-semibold hover:border-race-accent/60";

export default async function RaceDayPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireSection("raceControl.overview", "read");
  const [showStart, showLive, showSpeaker, showResultboard] = await Promise.all([
    canAccess("raceControl.start", "read"),
    canAccess("raceControl.live", "write"),
    canAccess("screens.speaker", "read"),
    canAccess("screens.resultboard", "read"),
  ]);
  const copy = await getTranslations({ locale, namespace: "RaceDay" });

  const [{ year }, history] = await Promise.all([
    currentRaceYear(),
    prisma.auditLog.findMany({
      where: { action: { startsWith: "raceday." } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);
  const dateTime = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "cs-CZ", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Europe/Prague",
  });

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <McvvTestRunBanner locale={locale} leftovers className="mb-4" />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("heading", { year })}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted">{copy("intro")}</p>

        {showStart ? (
          <section
            className="mt-8 grid gap-4 border border-race-line/60 bg-race-surface/40 p-5"
            data-testid="start-check-link"
          >
            <h2 className="font-display text-xl font-semibold">{copy("startTitle")}</h2>
            <p className="text-sm leading-6 text-race-muted">{copy("startIntro")}</p>
            <div className="flex flex-wrap gap-3">
              <Link className={buttonClass} href="/admin/den-zavodu/start">
                {copy("startOpen")}
              </Link>
            </div>
          </section>
        ) : null}

        {showLive ? (
          <section
            className="mt-8 grid gap-4 border border-race-line/60 bg-race-surface/40 p-5"
            data-testid="live-results-link"
          >
            <h2 className="font-display text-xl font-semibold">{copy("liveTitle")}</h2>
            <p className="text-sm leading-6 text-race-muted">{copy("liveIntro")}</p>
            <div className="flex flex-wrap gap-3">
              <Link className={buttonClass} href="/admin/den-zavodu/zive">
                {copy("liveOpen")}
              </Link>
            </div>
          </section>
        ) : null}

        {showSpeaker ? (
          <section
            className="mt-8 grid gap-4 border border-race-line/60 bg-race-surface/40 p-5"
            data-testid="speaker-link"
          >
            <h2 className="font-display text-xl font-semibold">{copy("speakerTitle")}</h2>
            <p className="text-sm leading-6 text-race-muted">{copy("speakerIntro")}</p>
            <div className="flex flex-wrap gap-3">
              <Link className={buttonClass} href="/mezicasy/speaker">
                {copy("speakerOpen")}
              </Link>
            </div>
          </section>
        ) : null}

        {showResultboard ? (
          <section
            className="mt-8 grid gap-4 border border-race-line/60 bg-race-surface/40 p-5"
            data-testid="resultboard-link"
          >
            <h2 className="font-display text-xl font-semibold">{copy("resultboardTitle")}</h2>
            <p className="text-sm leading-6 text-race-muted">{copy("resultboardIntro")}</p>
            <div className="flex flex-wrap gap-3">
              <Link className={buttonClass} href="/resultboard">
                {copy("resultboardOpen")}
              </Link>
              <Link className={buttonClass} href="/admin/den-zavodu/zive">
                {copy("resultboardSettings")}
              </Link>
            </div>
          </section>
        ) : null}

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
