import { unstable_cache } from "next/cache";

import { getClubResolver } from "@/lib/clubs/queries";
import { prisma } from "@/lib/db/client";
import { PHOTOS_CACHE_TAG } from "@/lib/photos/queries";
import { loadAllResults } from "@/lib/stats/queries";

import { computeStatsOverview, type PhotoCount, type StatsOverview } from "./overview";

export const STATS_CACHE_TAG = "stats";
const PHOTO_LEADERS_FETCH = 10;

async function loadPhotoCounts(): Promise<{ counts: PhotoCount[]; total: number }> {
  const [groups, total] = await Promise.all([
    prisma.runnerPhoto.groupBy({
      by: ["runnerId"],
      where: { photo: { hasImage: true } },
      _count: { photoId: true },
      orderBy: { _count: { photoId: "desc" } },
      take: PHOTO_LEADERS_FETCH,
    }),
    prisma.photo.count({ where: { hasImage: true } }),
  ]);
  const runners = await prisma.runner.findMany({
    where: { id: { in: groups.map((group) => group.runnerId) } },
    select: { id: true, name: true },
  });
  const names = new Map(runners.map((runner) => [runner.id, runner.name.trim()]));
  return {
    counts: groups.map((group) => ({
      runnerId: group.runnerId,
      name: names.get(group.runnerId) || "—",
      count: group._count.photoId,
    })),
    total,
  };
}

/**
 * Everything the /statistiky overview needs, computed once per hour. Tagged "stats" (also
 * revalidated by club merges in the admin) and,
 * because of the photo tile, "photos" (photo uploads / tagging revalidate it too).
 */
export const getStatsOverview = unstable_cache(
  async (): Promise<StatsOverview> => {
    const [results, photos, clubs] = await Promise.all([
      loadAllResults(),
      loadPhotoCounts(),
      getClubResolver(),
    ]);
    return computeStatsOverview(results, photos.counts, photos.total, clubs);
  },
  ["stats-overview"],
  { revalidate: 3600, tags: [STATS_CACHE_TAG, PHOTOS_CACHE_TAG] },
);
