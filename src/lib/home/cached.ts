import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/db/client";
import { countValidRunners } from "@/lib/entries/status";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";

import {
  HOME_COUNTS_REVALIDATE_SECONDS,
  HOME_COUNTS_TAG,
  HOME_RESULTS_REVALIDATE_SECONDS,
  toHomeWinner,
  type HomeCounts,
  type HomeResultsSummary,
} from "./summary-core";

const winnerSelect = {
  runnerName: true,
  time: true,
  runnerId: true,
  runner: { select: { name: true } },
} as const;

async function loadHomeResultsSummary(): Promise<HomeResultsSummary | null> {
  const latest = await prisma.result.findFirst({
    orderBy: { year: "desc" },
    select: { year: true },
  });
  if (!latest) return null;
  const year = latest.year;
  const [count, men, women] = await Promise.all([
    prisma.result.count({ where: { year } }),
    prisma.result.findFirst({
      where: { year, categoryId: "A" },
      orderBy: { time: "asc" },
      select: winnerSelect,
    }),
    prisma.result.findFirst({
      where: { year, categoryId: "F" },
      orderBy: { time: "asc" },
      select: winnerSelect,
    }),
  ]);
  return { year, count, men: toHomeWinner(men), women: toHomeWinner(women) };
}

/** Latest results year with its count and the overall winners (homepage results section). */
export const getHomeResultsSummary = unstable_cache(
  loadHomeResultsSummary,
  ["home-results-summary-v1"],
  { revalidate: HOME_RESULTS_REVALIDATE_SECONDS, tags: [STATS_CACHE_TAG] },
);

async function loadHomeCounts(year: number): Promise<HomeCounts> {
  const [resultsCount, startlistCount, entriesCount] = await Promise.all([
    prisma.result.count({ where: { year } }),
    prisma.startEntry.count({ where: { year } }),
    countValidRunners(year),
  ]);
  return { resultsCount, startlistCount, entriesCount };
}

/** Hero counts of the race year (registered runners, startlist, results). */
export const getHomeCounts = unstable_cache(loadHomeCounts, ["home-counts-v1"], {
  revalidate: HOME_COUNTS_REVALIDATE_SECONDS,
  tags: [HOME_COUNTS_TAG, STATS_CACHE_TAG],
});
