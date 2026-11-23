/**
 * Cached official team standings. Results change only on an official publish, a result
 * correction, or a club/name fix — all of those revalidate the "stats" tag. The hour is a
 * safety net, the same as /results and /statistiky.
 */
import { unstable_cache } from "next/cache";

import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";

import { loadAllTeamCompetitions, loadYearTeamCompetition } from "./query";

const TEAM_CACHE = { revalidate: 3600, tags: [STATS_CACHE_TAG] };

export const getYearTeamCompetition = unstable_cache(
  loadYearTeamCompetition,
  ["team-competition-year-v2"],
  TEAM_CACHE,
);

export const getAllTeamCompetitions = unstable_cache(
  loadAllTeamCompetitions,
  ["team-competition-all-v2"],
  TEAM_CACHE,
);
