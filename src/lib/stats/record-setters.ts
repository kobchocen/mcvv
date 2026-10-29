import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/db/client";

import { STATS_CACHE_TAG } from "./overview-query";
import { recordSetters } from "./records-core";

/**
 * Traťové rekordy podle ročníku: `{ [rok]: { [id běžce]: [id kategorií] } }`. Mění se jen
 * importem výsledků (revaliduje tag „stats“), proto v cache – stránka ročníku kvůli tomu
 * nečte všechny výsledky při každém zobrazení.
 */
export const getRecordSettersByYear = unstable_cache(
  async (): Promise<Record<number, Record<string, string[]>>> => {
    const [categories, results] = await Promise.all([
      prisma.category.findMany({
        orderBy: { sort: "asc" },
        select: { id: true, sex: true, age: true },
      }),
      prisma.result.findMany({ select: { year: true, runnerId: true, time: true } }),
    ]);
    const out: Record<number, Record<string, string[]>> = {};
    for (const s of recordSetters(categories, results)) {
      const year = (out[s.year] ??= {});
      (year[s.runnerId] ??= []).push(s.category);
    }
    return out;
  },
  ["record-setters-v1"],
  { revalidate: 3600, tags: [STATS_CACHE_TAG] },
);
