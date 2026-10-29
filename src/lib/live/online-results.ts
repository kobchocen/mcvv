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
import { inHiddenWindow, peekStoredTestRun, publicHiddenWindow, publicZero } from "./test-run";

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
 * žádné kluby, e-maily ani ID účtů či běžců (traťové rekordy počítá server). Jen čtení (test se tu neukončuje, viz `peekStoredTestRun`).
 *
 * Testovací běh (#186) se veřejně neukazuje vůbec (Q117): mezičasy, cíle a záznamy Startu
 * zapsané během testu se do snímku nedostanou a plánované starty jsou od ostré nuly, ne od
 * zkušební. Speaker a interní obrazovky test dál vidí (se štítkem TEST).
 */
export async function loadOnlineSnapshot(
  now = new Date(),
  /** Resultboard `?test=1` pro přihlášené: test i jeho nula jako na speakerovi (Q135). */
  options: { includeTest?: boolean } = {},
): Promise<OnlineSnapshot> {
  const [rawCtx, stations, { run, cutoff }] = await Promise.all([
    getRaceContext(),
    getStations(),
    peekStoredTestRun(now),
  ]);
  const hidden = options.includeTest ? null : publicHiddenWindow(run, cutoff);
  const ctx = options.includeTest
    ? rawCtx
    : { ...rawCtx, zero: publicZero(rawCtx, run, now, cutoff) };
  const [{ categories, runners, tr }, allStartChecks] = await Promise.all([
    loadRaceRunners(ctx, stations, (created) => inHiddenWindow(created, hidden)),
    prisma.startCheck.findMany({
      where: { year: ctx.year },
      select: { bib: true, startedAt: true, createdAt: true },
    }),
  ]);
  const startChecks = allStartChecks.filter((s) => !inHiddenWindow(s.createdAt, hidden));
  const startedAt = new Map(startChecks.map((s) => [s.bib, s.startedAt]));
  const slugs = categorySlugs(categories);
  return {
    year: ctx.year,
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
    tr,
  };
}

/** Sdílená cache snímku na replice (viz `createBodyCache`). */
export const onlineResultsCache = createBodyCache(
  async () => encodeOnline(await loadOnlineSnapshot()),
  ONLINE_RESULTS_CACHE_MS,
);
