import { prisma } from "@/lib/db/client";

import {
  categoryShort,
  categorySlugs,
  effectiveDnsGrace,
  encodeOnline,
  lateStart,
  type OnlineSnapshot,
} from "./online-results-core";
import { getRaceContext, getStations } from "./race-context";
import { createBodyCache } from "./speaker-cache";
import { loadRaceRunners } from "./speaker";
import { startOffsetSeconds } from "./start-check-core";
import { peekActiveTestRun } from "./test-run";

/**
 * Jak dlouho sdílí všichni diváci jeden snímek z DB (polling klienta je 5 s): na repliku
 * nejvýš jeden výpočet za 5 s bez ohledu na počet diváků (single-flight v `createBodyCache`).
 */
export const ONLINE_RESULTS_CACHE_MS = 5000;
/** HTTP cache odpovědi `/api/live/results` pro prohlížeč i sdílené cache (CDN). */
export const ONLINE_RESULTS_CACHE_CONTROL =
  "public, max-age=5, s-maxage=5, stale-while-revalidate=10";

/**
 * Snímek veřejných online výsledků: stejná data jako speaker (#188) + jestli číslo má
 * záznam stanice Start a štítek pozdního startu nad prahem #228. Jen data pro zobrazení –
 * žádné kluby, e-maily ani ID účtů. Jen čtení (test se tu neukončuje, viz `peekActiveTestRun`).
 */
export async function loadOnlineSnapshot(now = new Date()): Promise<OnlineSnapshot> {
  const [ctx, stations, testRun] = await Promise.all([
    getRaceContext(),
    getStations(),
    peekActiveTestRun(now),
  ]);
  const [{ categories, runners }, startChecks] = await Promise.all([
    loadRaceRunners(ctx, stations),
    prisma.startCheck.findMany({
      where: { year: ctx.year },
      select: { bib: true, startedAt: true },
    }),
  ]);
  const startedAt = new Map(startChecks.map((s) => [s.bib, s.startedAt]));
  const slugs = categorySlugs(categories);
  return {
    year: ctx.year,
    test: testRun !== null,
    dnsGraceS: effectiveDnsGrace(startChecks.length > 0, ctx.dnsGraceS, ctx.dnsGraceFallbackS),
    categories: categories.map((c, i) => ({
      id: c.id,
      name: c.name,
      sex: c.sex,
      slug: slugs[i],
      short: categoryShort(c.name),
    })),
    runners: runners.map((r) => {
      const at = startedAt.get(r.bib);
      return {
        ...r,
        started: at !== undefined,
        late: at
          ? lateStart(startOffsetSeconds(at, ctx.zero, r.bib, ctx.intervalS), ctx.startLimitS)
          : null,
      };
    }),
  };
}

/** Sdílená cache snímku na replice (viz `createBodyCache`). */
export const onlineResultsCache = createBodyCache(
  async () => encodeOnline(await loadOnlineSnapshot()),
  ONLINE_RESULTS_CACHE_MS,
);
