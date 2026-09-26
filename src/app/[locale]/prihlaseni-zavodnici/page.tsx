import type { Metadata } from "next";
import { Fragment } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvPublicNavbar } from "@/components/organisms";
import { dateInputValue } from "@/lib/admin/parse";
import { bestRaceTimes, countPastStarts } from "@/lib/entries/starts";
import { ENTRY_STATUS } from "@/lib/entries/status";
import { currentRaceYear } from "@/lib/entries/year";
import { prisma } from "@/lib/db/client";
import { formatRaceTime } from "@/lib/utils";
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
  const { year, deadline, open } = await currentRaceYear();
  const edition = await prisma.edition.findFirst({
    orderBy: { id: "desc" },
    select: { startAdultPlace: true, startKidsPlace: true },
  });
  const lines = await prisma.registrationLine.findMany({
    where: { year, registration: { status: ENTRY_STATUS.confirmed } },
    include: {
      runner: { select: { name: true } },
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
        birth: string;
        club: string;
        starts: number;
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
      birth: line.runnerId.slice(0, 4),
      club: line.club.name,
      starts: startsById.get(line.runnerId) ?? 0,
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
              {copy("eyebrow")}
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
              {copy("deadline")}: {dateInputValue(deadline)}
            </p>
          ) : null}
          {open ? (
            <Button
              asChild
              className="mt-6 h-11 bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover"
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
                <table className="w-full min-w-[40rem] table-fixed border-collapse text-left text-sm">
                  <colgroup>
                    <col className="w-[28%]" />
                    <col className="w-[12%]" />
                    <col className="w-[28%]" />
                    <col className="w-[18%]" />
                    <col className="w-[14%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                      <th className="py-2 pr-3">{copy("colName")}</th>
                      <th className="py-2 pr-3">{copy("colBirth")}</th>
                      <th className="py-2 pr-3">{copy("colClub")}</th>
                      <th className="py-2 pr-3">{copy("colStarts")}</th>
                      <th className="py-2">{copy("colRecord")}</th>
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
                            <td className="py-2.5 pr-3 font-medium">{runner.name}</td>
                            <td className="py-2.5 pr-3 text-race-muted">{runner.birth}</td>
                            <td className="py-2.5 pr-3 text-race-muted">{runner.club}</td>
                            <td className="py-2.5 pr-3 text-race-muted">
                              {runner.starts > 0
                                ? copy("starts", { count: runner.starts })
                                : copy("newbie")}
                            </td>
                            <td className="py-2.5 tabular-nums text-race-muted">
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
