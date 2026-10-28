import type { Metadata } from "next";
import { Fragment } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvPublicNavbar } from "@/components/organisms";
import { shortBirthYear } from "@/lib/format/birth-year";
import { formatDate } from "@/lib/format/date";
import { isNewbie } from "@/lib/entries/newbie";
import { bestRaceTimes, countPastStarts } from "@/lib/entries/starts";
import { validRegistrationIds } from "@/lib/entries/status";
import { ClubLink, RunnerNameLink } from "@/components/molecules";
import { currentRaceYear, editionNumber } from "@/lib/entries/year";
import { prisma } from "@/lib/db/client";
import { formatRaceTime } from "@/lib/utils";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";
import { Button } from "@/components/ui/button";

/**
 * Desktop (sm+) keeps the original five columns (py-2 / py-2.5, pr-3). On phones Klub and
 * Starty are hidden (shown as a 2nd line under the name), the birth year shrinks to ’07 and
 * the OR column stays on the right.
 */
const cx = {
  name: "py-2 pr-3",
  birth: "w-[1%] whitespace-nowrap py-2 pr-3 sm:w-auto sm:whitespace-normal",
  desktop: "hidden py-2 pr-3 sm:table-cell",
  record: "w-[1%] whitespace-nowrap py-2 text-right sm:w-auto sm:whitespace-normal sm:text-left",
  nameCell:
    "py-2.5 pr-3 leading-tight [overflow-wrap:anywhere] sm:leading-[inherit] sm:[overflow-wrap:normal]",
  birthCell: "w-[1%] whitespace-nowrap py-2.5 pr-3 sm:w-auto sm:whitespace-normal",
  desktopCell: "hidden py-2.5 pr-3 sm:table-cell",
  recordCell:
    "w-[1%] whitespace-nowrap py-2.5 text-right sm:w-auto sm:whitespace-normal sm:text-left",
} as const;

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
  const raceYear = await currentRaceYear();
  const { year, deadline, open } = raceYear;
  const edition = await prisma.edition.findFirst({
    orderBy: { id: "desc" },
    select: { startAdultPlace: true, startKidsPlace: true },
  });
  const validIds = await validRegistrationIds(year);
  const lines = await prisma.registrationLine.findMany({
    where: { year, registrationId: { in: [...validIds] } },
    include: {
      runner: { select: { name: true, nationality: true } },
      club: { select: { name: true } },
      category: { select: { name: true, sort: true } },
    },
  });
  const runnerIds = [...new Set(lines.map((line) => line.runnerId))];
  const [startsById, recordsById] = await Promise.all([
    countPastStarts(runnerIds, year),
    bestRaceTimes(runnerIds),
  ]);
  const groups = new Map<
    string,
    {
      sort: number;
      name: string;
      runners: {
        id: string;
        name: string;
        nationality: string | null;
        birth: string;
        club: string;
        clubId: string;
        starts: number;
        newbie: boolean;
        record: number | null;
      }[];
    }
  >();
  for (const line of lines) {
    const group = groups.get(line.categoryId) ?? {
      sort: line.category.sort,
      name: line.category.name,
      runners: [],
    };
    group.runners.push({
      id: line.runnerId,
      name: line.runner.name,
      nationality: line.runner.nationality,
      birth: line.runnerId.slice(0, 4),
      club: line.club.name,
      clubId: line.clubId,
      starts: startsById.get(line.runnerId) ?? 0,
      newbie: isNewbie(startsById.get(line.runnerId) ?? 0),
      record: recordsById.get(line.runnerId) ?? null,
    });
    groups.set(line.categoryId, group);
  }
  const categories = [...groups.values()].sort((a, b) => a.sort - b.sort);
  for (const group of categories) {
    group.runners.sort((a, b) => a.name.localeCompare(b.name, locale));
  }

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
            {copy("total", { count: lines.length })}
          </p>
          <p className="mt-2 text-sm text-race-muted">{copy("paidOnly")}</p>
          {deadline ? (
            <p className="mt-2 text-sm text-race-muted">
              {copy("deadline")}: {formatDate(deadline, locale)}
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
                adult: edition?.startAdultPlace ?? 200,
                kids: edition?.startKidsPlace ?? 100,
              })}
            </p>
          )}

          <div className="mt-12">
            {categories.length === 0 ? (
              <p className="text-sm text-race-muted">{copy("empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                {/* Below sm the Klub and Starty columns become a 2nd line under the name. */}
                <table className="w-full border-collapse text-left text-sm sm:min-w-[40rem] sm:table-fixed">
                  <colgroup>
                    <col className="sm:w-[28%]" />
                    <col className="sm:w-[12%]" />
                    <col className="sm:w-[28%]" />
                    <col className="sm:w-[18%]" />
                    <col className="sm:w-[14%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                      <th className={cx.name}>{copy("colName")}</th>
                      <th className={cx.birth}>{copy("colBirth")}</th>
                      <th className={cx.desktop}>{copy("colClub")}</th>
                      <th className={cx.desktop}>{copy("colStarts")}</th>
                      <th className={cx.record}>{copy("colRecord")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((group, index) => (
                      <Fragment key={group.name}>
                        <tr>
                          <th
                            colSpan={5}
                            className={`pb-2 font-display text-xl font-semibold text-foreground dark:text-white ${index === 0 ? "pt-4" : "pt-8"}`}
                          >
                            {group.name} ({group.runners.length})
                          </th>
                        </tr>
                        {group.runners.map((runner) => (
                          <tr key={runner.id} className="border-b border-race-line/40">
                            <td className={`${cx.nameCell} font-medium`}>
                              <RunnerNameLink
                                id={runner.id}
                                name={runner.name}
                                nationality={runner.nationality}
                              />
                              <span className="mt-0.5 block text-xs leading-[1.3] font-normal text-race-muted sm:hidden">
                                {runner.club.trim() ? (
                                  <>
                                    <ClubLink id={runner.clubId} name={runner.club} />
                                    {" · "}
                                  </>
                                ) : null}
                                {runner.newbie ? (
                                  <span className="rounded-full bg-race-accent/15 px-1.5 py-px text-[0.6875rem] font-semibold text-race-accent">
                                    {copy("newbie")}
                                  </span>
                                ) : (
                                  copy("starts", { count: runner.starts })
                                )}
                              </span>
                            </td>
                            <td className={`${cx.birthCell} text-race-muted`}>
                              <span className="hidden sm:inline">{runner.birth}</span>
                              <span className="sm:hidden">{shortBirthYear(runner.birth)}</span>
                            </td>
                            <td className={`${cx.desktopCell} text-race-muted`}>
                              <ClubLink id={runner.clubId} name={runner.club} />
                            </td>
                            <td className={`${cx.desktopCell} text-race-muted`}>
                              {runner.newbie
                                ? copy("newbie")
                                : copy("starts", { count: runner.starts })}
                            </td>
                            <td className={`${cx.recordCell} tabular-nums text-race-muted`}>
                              {runner.record != null ? formatRaceTime(runner.record) : ""}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
