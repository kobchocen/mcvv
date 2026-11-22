import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvEntrantsTable, McvvPublicNavbar } from "@/components/organisms";
import { formatWeekdayDate, formatWeekdayDateTime } from "@/lib/format/date";
import { groupPublicEntrants, loadYearPublicEntrants } from "@/lib/entries/club-entrants";
import { currentRaceYear, editionNumber } from "@/lib/entries/year";
import { formatStartClock } from "@/lib/date/race-schedule";
import { slotOf, slotRunning } from "@/lib/slots/core";
import { prisma } from "@/lib/db/client";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";
import { Button } from "@/components/ui/button";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  const t = await getTranslations({ locale, namespace: "Entrants" });
  return { title: t("title") };
}

export default async function EntrantsPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "Entrants" });
  const brand = home.raw("brand") as McvvHomepageContent["brand"];
  const nav = home.raw("nav") as McvvHomepageContent["nav"];
  const [raceYear, { entrants }] = await Promise.all([currentRaceYear(), loadYearPublicEntrants()]);
  const { deadline, open } = raceYear;
  const onsite = slotOf(raceYear.slots, "onsite");
  // Pozdní přihlášky běží → konec pozdního termínu, startovné a lhůta na zaplacení (část 10).
  const late = slotOf(raceYear.slots, "late");
  const lateRunning = slotRunning(late, new Date());
  const standardLastDay = raceYear.standardEnd
    ? new Date(raceYear.standardEnd.getTime() - 1000)
    : deadline;
  const edition = await prisma.edition.findFirst({
    orderBy: { id: "desc" },
    select: { startAdultPlace: true, startKidsPlace: true },
  });
  const categories = groupPublicEntrants(entrants, locale);

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
            {copy("total", { count: entrants.length })}
          </p>
          <p className="mt-2 text-sm text-race-muted">{copy("paidOnly")}</p>
          {open && late && lateRunning ? (
            <p className="mt-2 text-sm text-race-muted">
              {copy("lateUntil", {
                end: formatWeekdayDateTime(late.to, locale),
                adult: late.feeAdult,
                kids: late.feeYouth,
                minutes: late.payWithinMinutes ?? 60,
              })}
            </p>
          ) : open && standardLastDay ? (
            <p className="mt-2 text-sm text-race-muted">
              {copy("standardUntil", { date: formatWeekdayDate(standardLastDay, locale) })}
            </p>
          ) : null}
          {open ? (
            <Button
              asChild
              className="mt-6 h-11 bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
            >
              <Link href="/prihlasky">{copy("register")}</Link>
            </Button>
          ) : (
            <p className="mt-6 max-w-xl text-base leading-7 text-race-muted">
              {copy("closed", {
                adult: onsite?.feeAdult ?? edition?.startAdultPlace ?? 200,
                kids: onsite?.feeYouth ?? edition?.startKidsPlace ?? 100,
                onsiteUntil: formatStartClock(raceYear.slotSettings.onsiteUntilS),
              })}
            </p>
          )}

          <div className="mt-12">
            {categories.length === 0 ? (
              <p className="text-sm text-race-muted">{copy("empty")}</p>
            ) : (
              <McvvEntrantsTable
                categories={categories}
                copy={{
                  colName: copy("colName"),
                  colBirth: copy("colBirth"),
                  colClub: copy("colClub"),
                  colStarts: copy("colStarts"),
                  colRecord: copy("colRecord"),
                  newbie: copy("newbie"),
                  starts: (values) => copy("starts", values),
                }}
              />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
