import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/db/client";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";

export type ResultYearCount = { year: number; count: number };

/**
 * Years with results and their participant counts for the /results year switcher. It was a
 * GROUP BY over the whole mcvv_time on every view (the most expensive query of the page);
 * results change only with a result import or a club/runner fix, which revalidate "stats".
 */
export const getResultYearCounts = unstable_cache(
  async (): Promise<ResultYearCount[]> => {
    const rows = await prisma.result.groupBy({
      by: ["year"],
      _count: { runnerId: true },
      orderBy: { year: "desc" },
    });
    return rows.map((row) => ({ year: row.year, count: row._count.runnerId }));
  },
  ["result-year-counts-v1"],
  { revalidate: 3600, tags: [STATS_CACHE_TAG] },
);
