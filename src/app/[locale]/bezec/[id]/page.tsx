import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvPublicNavbar } from "@/components/organisms";
import {
  RunnerPerfBar,
  RunnerPhotoGrid,
  RunnerPodiumBadges,
  RunnerPortrait,
  asPodiumRank,
  perfBarSegments,
  podiumRank,
} from "@/components/molecules";
import { Link } from "@/i18n/routing";
import { prisma } from "@/lib/db/client";
import { runnerSex } from "@/lib/stats/queries";
import { formatRaceTime } from "@/lib/utils";
import type { McvvHomepageContent } from "@/components/templates";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string; id: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const runner = await prisma.runner.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: runner?.name ?? id };
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

  const [runner, results, photoLinks, peerTimes, portrait] = await Promise.all([
    prisma.runner.findUnique({ where: { id }, select: { name: true } }),
    prisma.result.findMany({
      where: { runnerId: id },
      orderBy: { year: "desc" },
      include: {
        category: { select: { name: true, age: true } },
        club: { select: { name: true } },
      },
    }),
    prisma.runnerPhoto.findMany({
      where: { runnerId: id, photo: { image: { not: null } } },
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
    prisma.result.findMany({
      select: { time: true, runnerId: true, year: true, categoryId: true },
    }),
    prisma.webImage.findFirst({
      where: { runnerId: id, image: { not: null } },
      select: { id: true },
    }),
  ]);

  if (results.length === 0) {
    notFound();
  }

  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "Runner" });
  const name = runner?.name || results[0]?.runnerName || id;
  const birthYear = id.slice(0, 4);
  const times = results.map((row) => row.time);
  const record = Math.min(...times);
  const average = Math.round(times.reduce((sum, time) => sum + time, 0) / times.length);
  const last = results[0];
  const lastClub = last.club?.name || last.clubName || "";
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
  const sexRecord = peerTimes
    .filter((row) => runnerSex(row.runnerId) === sex)
    .reduce((min, row) => Math.min(min, row.time), Number.POSITIVE_INFINITY);
  const bars = results.map((row) => perfBarSegments(row.time, record, average, sexRecord));
  const barMax = bars.reduce((max, bar) => Math.max(max, bar.blue + bar.green + bar.red), 0);

  const summary = [
    { value: String(results.length), label: copy("starts") },
    { value: formatRaceTime(record), label: copy("record") },
    { value: formatRaceTime(average), label: copy("average") },
    { value: String(last.year), label: copy("lastStart") },
  ];

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
              {copy("eyebrow")}
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
                  {lastClub}
                </h2>
              ) : null}
              <dl className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${lastClub ? "mt-4" : ""}`}>
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
            </article>
          </div>

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
                  const inYear = peerTimes.filter((peer) => peer.year === row.year);
                  const absRank = asPodiumRank(
                    podiumRank(
                      inYear.filter((peer) => runnerSex(peer.runnerId) === sex),
                      id,
                    ),
                  );
                  const ageRank =
                    row.category.age > 0
                      ? asPodiumRank(
                          podiumRank(
                            inYear.filter((peer) => peer.categoryId === row.categoryId),
                            id,
                          ),
                        )
                      : undefined;
                  const graph = (
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
                        {row.time === record ? (
                          <span className="ml-2 inline-flex items-center bg-race-accent/15 px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wide text-race-accent">
                            {copy("os")}
                          </span>
                        ) : null}
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
                        {formatLoss(row.time, record, copy("os"))}
                      </td>
                      <td className="py-2.5 pr-4 text-race-muted">
                        {row.club?.name || row.clubName || "—"}
                      </td>
                      <td className="py-2.5 text-race-muted">{row.category.name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
              />
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
