import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/db/client";
import { createLimiter } from "@/lib/db/limit";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";

import { computeRunnerPeerIndex, type RunnerPeerIndex } from "./peers";

/**
 * DB slots for the runner profile (#199): all /bezec/[id] queries of one instance share at
 * most 3 of the 5 pool connections, so a crawler burst on profiles queues here instead of
 * starving the rest of the site (P2039).
 */
export const runnerProfileDb = createLimiter(3);

/**
 * Course records and podium places from all results. Results change only with a result
 * import, a club merge or a runner id fix in the admin; all of them revalidate the "stats"
 * tag. The hour is a safety net, the same as the statistics overview and club profiles.
 */
const cachedPeerIndex = unstable_cache(
  async (): Promise<RunnerPeerIndex> =>
    computeRunnerPeerIndex(
      await runnerProfileDb(() =>
        prisma.result.findMany({
          select: { runnerId: true, year: true, categoryId: true, time: true },
        }),
      ),
    ),
  ["runner-peer-index-v1"],
  { revalidate: 3600, tags: [STATS_CACHE_TAG] },
);

let pendingPeerIndex: Promise<RunnerPeerIndex> | null = null;

/** Cached peer index; concurrent requests on a cold cache share one load. */
export function getRunnerPeerIndex(): Promise<RunnerPeerIndex> {
  pendingPeerIndex ??= cachedPeerIndex().finally(() => {
    pendingPeerIndex = null;
  });
  return pendingPeerIndex;
}
