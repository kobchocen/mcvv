import { runnerNameFor } from "@/lib/format/runner-name";

/**
 * Homepage data cache (DB zátěž v den závodu): the homepage used to run ~18 queries per view,
 * most of them aggregates that change only with a result import, a startlist import or a new
 * registration. Everything here travels through `unstable_cache` as JSON, so only plain values.
 */

/** Tag of the hero counts (registered runners, startlist, results); entries/startlist revalidate it. */
export const HOME_COUNTS_TAG = "home-counts";

/** Hero counts may lag a minute behind a registration made on another replica. */
export const HOME_COUNTS_REVALIDATE_SECONDS = 60;

/** Results summary changes only with a result import / club or runner fix ("stats" tag). */
export const HOME_RESULTS_REVALIDATE_SECONDS = 3600;

export type HomeCounts = {
  resultsCount: number;
  startlistCount: number;
  entriesCount: number;
};

export type HomeWinner = { runnerId: string; name: string | null; time: number };

export type HomeResultsSummary = {
  year: number;
  count: number;
  men: HomeWinner | null;
  women: HomeWinner | null;
};

type WinnerRow = {
  runnerId: string;
  runnerName: string | null;
  time: number;
  runner: { name: string | null } | null;
} | null;

/** Winner row → JSON-safe winner with the display name already resolved (results context). */
export function toHomeWinner(row: WinnerRow): HomeWinner | null {
  if (!row) return null;
  return {
    runnerId: row.runnerId,
    name: runnerNameFor("results", row.runnerName, row.runner?.name),
    time: row.time,
  };
}
