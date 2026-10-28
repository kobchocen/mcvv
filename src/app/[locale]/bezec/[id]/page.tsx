import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { cache } from "react";

import { McvvPublicNavbar } from "@/components/organisms";
import {
  ClubLink,
  RunnerPerfBar,
  RunnerPhotoGrid,
  RunnerPodiumBadges,
  RunnerPortrait,
  perfBarSegments,
  RecordBadge,
} from "@/components/molecules";
import { Link } from "@/i18n/routing";
import { clubKey, createClubResolver } from "@/lib/clubs";
import { getClubIndex } from "@/lib/clubs/cached";
import { getClubResolver } from "@/lib/clubs/queries";
import { displayRunnerName } from "@/lib/format/runner-name";
import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { getRunnerPeerIndex, runnerProfileDb } from "@/lib/runner/cached";
import { courseRecordOf, podiumPlacesOf } from "@/lib/runner/peers";
import { isRunnerProfileMissing, summarizeRunnerResults } from "@/lib/runner/profile";
import { runnerSex } from "@/lib/stats/queries";
import { formatRaceTime } from "@/lib/utils";
import type { McvvHomepageContent } from "@/components/templates";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

/**
 * One runner lookup per request, shared by generateMetadata and the page (#199). All profile
 * queries go through `runnerProfileDb` (max 3 of the 5 pool connections).
 */
const loadRunner = cache((id: string) =>
  runnerProfileDb(() => prisma.runner.findUnique({ where: { id }, select: { name: true } })),
);

/**
 * Club names for the profile: the cached index (tag "stats") unless a club id of the rows is
 * not in it yet (e.g. a new club of a first-timer's registration), then a fresh load.
 */
async function profileClubResolver(clubIds: readonly (string | null | undefined)[]) {
  const index = await getClubIndex();
  const known = new Set(index.names.map((row) => clubKey(row.id)));
  if (clubIds.every((clubId) => !clubKey(clubId) || known.has(clubKey(clubId)))) {
    return createClubResolver(index);
  }
  return runnerProfileDb(() => getClubResolver());
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const runner = await loadRunner(id);
  return {
    title: runner?.name ?? id,
    // The profile has no query parameters; variants with any are duplicates for crawlers.
    ...(Object.keys(query).length > 0 ? { robots: { index: false, follow: false } } : {}),
  };
}

function formatLoss(time: number, record: number, osLabel: string): string {
  const delta = time - record;
  if (delta <= 0) {
    return osLabel;
  }
  return formatRaceTime(delta);
}

export default async function RunnerPage({ params }: PageProps) {
  const { locale: requestedLocale, id } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  // Only the runner's own rows hit the DB; course records and podium places of all results
  // come from the cached peer index (#199, formerly a full scan of mcvv_time per request).
  const [runner, results, photoLinks, portrait, peers] = await Promise.all([
    loadRunner(id),
    runnerProfileDb(() =>
      prisma.result.findMany({
        where: { runnerId: id },
        orderBy: { year: "desc" },
        include: {
          category: { select: { name: true, age: true } },
          club: { select: { name: true } },
        },
      }),
    ),
    runnerProfileDb(() =>
      prisma.runnerPhoto.findMany({
        where: { runnerId: id, photo: { hasImage: true } },
        select: {
          photoId: true,
          photo: {
            select: {
              year: true,
              debugText: true,
              location: { select: { desc: true } },
            },
          },
        },
      }),
    ),
    runnerProfileDb(() =>
      prisma.webImage.findFirst({
        where: { runnerId: id, image: { not: null } },
        select: { id: true },
      }),
    ),
    getRunnerPeerIndex(),
  ]);

  // 404 only when the runner does not exist at all. A runner without results
  // (e.g. first-timer registered for the current year) gets a slim profile (#81).
  if (isRunnerProfileMissing(runner)) {
    notFound();
  }

  const stats = summarizeRunnerResults(results);
  // The current edition matters only for the slim profile of a runner without results.
  const raceYear = stats ? null : await runnerProfileDb(() => currentRaceYear());
  const registration = raceYear
    ? await runnerProfileDb(() =>
        prisma.registrationLine.findUnique({
          where: { year_runnerId: { year: raceYear.year, runnerId: id } },
          select: {
            clubId: true,
            club: { select: { name: true } },
            category: { select: { name: true } },
          },
        }),
      )
    : null;
  const clubs = await profileClubResolver([
    ...results.map((row) => row.clubId),
    registration?.clubId,
  ]);

  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "Runner" });
  // Older results may carry a former (e.g. maiden) name; show it alongside the current one.
  const formerName = [...results]
    .reverse()
    .find(
      (row) => row.runnerName && displayRunnerName(row.runnerName, runner?.name) !== row.runnerName,
    )?.runnerName;
  const name = displayRunnerName(formerName ?? results[0]?.runnerName, runner?.name) || id;
  const birthYear = id.slice(0, 4);
  const record = stats?.record ?? 0;
  const average = stats?.average ?? 0;
  const last = results.at(0);
  // Club by id (#104): name of the edition; a merged id shows the main id's name.
  const lastClubResolved = last
    ? clubs.resolve(last.clubId, last.year, last.club?.name || last.clubName)
    : registration && raceYear
      ? clubs.resolve(registration.clubId, raceYear.year, registration.club.name)
      : null;
  const lastClub = lastClubResolved?.name ?? "";
  const registeredCategory = registration?.category.name || "";
  const photos = [
    ...new Map(
      photoLinks.map((row) => [
        row.photoId,
        {
          id: row.photoId,
          year: row.photo.year,
          caption: (row.photo.location?.desc || row.photo.debugText || "").trim(),
        },
      ]),
    ).values(),
  ].sort((a, b) => b.year - a.year || b.id - a.id);
  const sex = runnerSex(id);
  const sexRecord = courseRecordOf(peers, sex);
  const bars = results.map((row) => perfBarSegments(row.time, record, average, sexRecord));
  const barMax = bars.reduce((max, bar) => Math.max(max, bar.blue + bar.green + bar.red), 0);

  const summary =
    stats && last
      ? [
          { value: String(stats.starts), label: copy("starts") },
          { value: formatRaceTime(record), label: copy("record") },
          { value: formatRaceTime(average), label: copy("average") },
          { value: String(last.year), label: copy("lastStart") },
        ]
      : [];

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar
        content={{
          brand: home.raw("brand") as McvvHomepageContent["brand"],
          nav: home.raw("nav") as McvvHomepageContent["nav"],
        }}
        variant="solid"
      />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {copy("eyebrow", { sex })}
            </p>
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold text-foreground dark:text-white sm:text-5xl">
            {name}
            <span className="ml-3 text-2xl font-semibold text-race-muted sm:text-3xl">
              * {birthYear}
            </span>
          </h1>

          <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-start">
            {portrait ? <RunnerPortrait id={id} name={name} /> : null}
            <article className="min-w-0 flex-1 self-stretch border border-race-line/55 bg-race-surface p-5">
              {lastClub ? (
                <h2 className="font-display text-xl font-semibold text-foreground dark:text-white">
                  <ClubLink slug={lastClubResolved?.slug} name={lastClub} />
                </h2>
              ) : null}
              {summary.length > 0 ? (
                <dl
                  className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${lastClub ? "mt-4" : ""}`}
                >
                  {summary.map((item) => (
                    <div key={item.label}>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-race-dim">
                        {item.label}
                      </dt>
                      <dd className="mt-1 font-display text-3xl font-bold text-foreground dark:text-white">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className={lastClub ? "mt-4" : ""}>
                  {registeredCategory ? (
                    <p className="text-sm text-race-muted">
                      {copy("category")}: {registeredCategory}
                    </p>
                  ) : null}
                  <p className="mt-2 font-display text-lg font-semibold text-race-accent">
                    {registration && raceYear
                      ? copy("registeredFirstStart", { year: raceYear.year, sex })
                      : copy("empty", { sex })}
                  </p>
                </div>
              )}
              <Link
                href="/statistiky"
                className="mt-4 inline-block text-sm font-semibold text-race-accent hover:underline"
              >
                {copy("statsLink")} →
              </Link>
            </article>
          </div>

          {results.length > 0 ? (
            <div className="mt-10 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                    <th className="py-2 pr-4">{copy("year")}</th>
                    <th className="py-2 pr-4">{copy("time")}</th>
                    <th className="hidden py-2 pr-4 md:table-cell">{copy("graph")}</th>
                    <th className="py-2 pr-4">{copy("loss")}</th>
                    <th className="py-2 pr-4">{copy("club")}</th>
                    <th className="py-2">{copy("category")}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, index) => {
                    const bar = bars[index];
                    const places = podiumPlacesOf(peers, row.year, id);
                    const absRank = places.absolute;
                    const ageRank = row.category.age > 0 ? places.category : undefined;
                    const isCourseRecord = row.time <= sexRecord;
                    const graph = isCourseRecord ? (
                      <RecordBadge kind="course" label={copy("courseRecord")} />
                    ) : (
                      <RunnerPerfBar
                        blue={bar.blue}
                        green={bar.green}
                        red={bar.red}
                        max={barMax}
                        title={copy("graphTitle", {
                          course: formatRaceTime(Math.max(0, row.time - sexRecord)),
                          pb: formatRaceTime(Math.max(0, row.time - record)),
                          avg: formatRaceTime(Math.max(0, row.time - average)),
                        })}
                      />
                    );
                    return (
                      <tr
                        key={`${row.year}-${row.runnerId}`}
                        className="border-b border-race-line/40"
                      >
                        <td className="py-2.5 pr-4">
                          <Link
                            href={`/results/${row.year}#${id}` as never}
                            className="font-medium text-race-accent hover:underline"
                          >
                            {row.year}
                          </Link>
                          <RunnerPodiumBadges
                            absoluteRank={absRank}
                            categoryRank={ageRank}
                            absoluteLabel={copy("medalAbs", { rank: absRank ?? 0 })}
                            categoryLabel={copy("medalAge", { rank: ageRank ?? 0 })}
                          />
                        </td>
                        <td className="py-2.5 pr-4 font-display font-semibold text-race-accent">
                          {formatRaceTime(row.time)}
                          <div className="mt-1 md:hidden">{graph}</div>
                        </td>
                        <td className="hidden py-2.5 pr-4 align-middle md:table-cell">{graph}</td>
                        <td className="py-2.5 pr-4 text-race-muted">
                          {row.time <= record ? (
                            <RecordBadge kind="personal" label={copy("personalBest")} />
                          ) : (
                            formatLoss(row.time, record, copy("os"))
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-race-muted">
                          <ClubLink
                            slug={
                              clubs.resolve(row.clubId, row.year, row.club?.name || row.clubName)
                                ?.slug
                            }
                            name={clubs.display(
                              row.clubId,
                              row.year,
                              row.club?.name || row.clubName,
                            )}
                          />
                        </td>
                        <td className="py-2.5 text-race-muted">{row.category.name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {photos.length > 0 ? (
            <div className="mt-12">
              <h2 className="font-display text-2xl font-semibold text-foreground dark:text-white">
                {copy("photos")}
              </h2>
              <RunnerPhotoGrid
                photos={photos}
                name={name}
                loadMoreLabel={copy("loadMore")}
                closeLabel={copy("close")}
                previousLabel={copy("previousPhoto")}
                nextLabel={copy("nextPhoto")}
              />
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
