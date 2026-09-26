import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvPublicNavbar } from "@/components/organisms";
import { dateInputValue } from "@/lib/admin/parse";
import { ENTRY_STATUS } from "@/lib/entries/status";
import { currentRaceYear } from "@/lib/entries/year";
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
  const startRows =
    runnerIds.length === 0
      ? []
      : await prisma.result.groupBy({
          by: ["runnerId"],
          where: { runnerId: { in: runnerIds }, year: { not: year } },
          _count: { _all: true },
        });
  const startsById = new Map(startRows.map((row) => [row.runnerId, row._count._all]));
  const groups = new Map<
    string,
    {
      sort: number;
      name: string;
      runners: { id: string; name: string; birth: string; club: string; starts: number }[];
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
          {deadline ? (
            <p className="mt-4 text-sm text-race-muted">
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

          <div className="mt-12 space-y-10">
            {categories.length === 0 ? (
              <p className="text-sm text-race-muted">{copy("empty")}</p>
            ) : (
              categories.map((group) => (
                <section key={group.name}>
                  <h2 className="font-display text-2xl font-semibold">{group.name}</h2>
                  <ul className="mt-3 divide-y divide-race-line/40">
                    {group.runners.map((runner) => (
                      <li key={runner.id} className="flex flex-wrap gap-x-4 py-2 text-sm">
                        <span className="min-w-[10rem] font-medium">{runner.name}</span>
                        <span className="text-race-muted">{runner.birth}</span>
                        {runner.club ? (
                          <span className="text-race-muted">{runner.club}</span>
                        ) : null}
                        <span className="text-race-muted">
                          {runner.starts > 0
                            ? copy("starts", { count: runner.starts })
                            : copy("newbie")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
