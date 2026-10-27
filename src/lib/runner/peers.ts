/**
 * Course records and podium places for the runner profile (`/bezec/[id]`), #199.
 *
 * The profile used to load every row of `mcvv_time` on each request to find the course record
 * of the runner's sex and the runner's absolute / category podium places. That is the same for
 * all profiles, so it is computed once from all results (cached under the "stats" tag) and the
 * profile only looks up its own years. Ranking mirrors `podiumRank` (ties share a place,
 * the next place skips: 1, 1, 3) – only places 1–3 are kept.
 */
import { runnerSex } from "@/lib/stats/core";

export type PeerResultRow = Readonly<{
  runnerId: string;
  year: number;
  categoryId: string;
  time: number;
}>;

export type PodiumPlace = 1 | 2 | 3;

export type RunnerPeerIndex = {
  /** Fastest time ever per sex (by runner id), null without results. */
  courseRecord: { M: number | null; F: number | null };
  /** "<year>:<runnerId>" → [absolute place within the sex, place within the category]. */
  podium: Record<string, [PodiumPlace | null, PodiumPlace | null]>;
};

function podiumKey(year: number, runnerId: string): string {
  return `${year}:${runnerId}`;
}

function asPlace(rank: number): PodiumPlace | null {
  return rank === 1 || rank === 2 || rank === 3 ? rank : null;
}

/** Places 1–3 of one group (same rules as `podiumRank`), first row of a runner wins. */
function groupPlaces(rows: readonly PeerResultRow[]): Map<string, PodiumPlace> {
  const sorted = [...rows].sort((a, b) => a.time - b.time);
  const places = new Map<string, PodiumPlace>();
  let rank = 1;
  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index];
    if (index > 0 && row.time !== sorted[index - 1].time) rank = index + 1;
    if (rank > 3) break;
    const place = asPlace(rank);
    if (place && !places.has(row.runnerId)) places.set(row.runnerId, place);
  }
  return places;
}

function groupBy(
  rows: readonly PeerResultRow[],
  key: (row: PeerResultRow) => string,
): Map<string, PeerResultRow[]> {
  const groups = new Map<string, PeerResultRow[]>();
  for (const row of rows) {
    const id = key(row);
    const list = groups.get(id);
    if (list) list.push(row);
    else groups.set(id, [row]);
  }
  return groups;
}

export function computeRunnerPeerIndex(rows: readonly PeerResultRow[]): RunnerPeerIndex {
  const courseRecord: RunnerPeerIndex["courseRecord"] = { M: null, F: null };
  for (const row of rows) {
    const sex = runnerSex(row.runnerId);
    const current = courseRecord[sex];
    if (current === null || row.time < current) courseRecord[sex] = row.time;
  }
  const podium: RunnerPeerIndex["podium"] = {};
  const entry = (row: { year: number; runnerId: string }) =>
    (podium[podiumKey(row.year, row.runnerId)] ??= [null, null]);
  for (const [, group] of groupBy(rows, (row) => `${row.year}:${runnerSex(row.runnerId)}`)) {
    const year = group[0].year;
    for (const [runnerId, place] of groupPlaces(group)) entry({ year, runnerId })[0] = place;
  }
  for (const [, group] of groupBy(rows, (row) => `${row.year}:${row.categoryId}`)) {
    const year = group[0].year;
    for (const [runnerId, place] of groupPlaces(group)) entry({ year, runnerId })[1] = place;
  }
  return { courseRecord, podium };
}

/** Course record of the sex; +Infinity without results (as `Math.min` over no rows). */
export function courseRecordOf(index: RunnerPeerIndex, sex: "M" | "F"): number {
  return index.courseRecord[sex] ?? Number.POSITIVE_INFINITY;
}

/** Absolute (within the sex) and category podium place of one result, if any. */
export function podiumPlacesOf(
  index: RunnerPeerIndex,
  year: number,
  runnerId: string,
): { absolute: PodiumPlace | undefined; category: PodiumPlace | undefined } {
  const places = index.podium[podiumKey(year, runnerId)];
  return { absolute: places?.[0] ?? undefined, category: places?.[1] ?? undefined };
}
