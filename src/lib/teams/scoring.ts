/**
 * Team competition scoring for MCVV (soutěž týmů, 2026 rules).
 *
 * Pure functions, no I/O. A team is the exact club name from the edition's results
 * list after trimming whitespace. Names are not unified (case, punctuation and
 * diacritics all matter). Official standings follow PRAVIDLA.md: points, then more
 * 1st places among counted performances, then more 2nds, and so on; identical
 * series share a rank and the next place is skipped.
 */
import { isNoClub } from "@/lib/clubs/core";

/** Men (A) and women (F) — the only categories on the 1st–10th scale. */
export const MAIN_CATEGORY_IDS = ["A", "F"] as const;

/** Points for 1st–10th in men and women. */
export const MAIN_POINTS = [20, 16, 12, 8, 6, 5, 4, 3, 2, 1] as const;

/** Points for 1st–5th in every other official category of the edition. */
export const OTHER_POINTS = [10, 8, 6, 4, 2] as const;

/** Minimum classified finishers for a team to enter the official ranking. */
export const MIN_FINISHERS = 3;

export function isMainCategoryId(categoryId: string): boolean {
  const id = categoryId.trim().toUpperCase();
  return id === "A" || id === "F";
}

/** Points for a category place; 0 if the place is unoccupied or outside the scale. */
export function pointsForPlace(categoryId: string, place: number): number {
  if (!Number.isInteger(place) || place < 1) return 0;
  const table = isMainCategoryId(categoryId) ? MAIN_POINTS : OTHER_POINTS;
  return table[place - 1] ?? 0;
}

/**
 * 1-based competition places within each category (ties share a place, the next
 * is skipped: 1, 2, 2, 4). Input order is irrelevant; the returned array matches
 * the input order.
 */
export function categoryPlaces(rows: readonly { categoryId: string; time: number }[]): number[] {
  const places = Array.from({ length: rows.length }, () => 0);
  const byCategory = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const group = byCategory.get(row.categoryId) ?? [];
    group.push(index);
    byCategory.set(row.categoryId, group);
  });
  for (const group of byCategory.values()) {
    group.sort((a, b) => rows[a]!.time - rows[b]!.time);
    let rank = 1;
    group.forEach((index, position) => {
      if (position > 0 && rows[index]!.time !== rows[group[position - 1]!]!.time) {
        rank = position + 1;
      }
      places[index] = rank;
    });
  }
  return places;
}

/** One classified finisher already placed in their category. */
export type TeamFinisher = {
  categoryId: string;
  categoryName?: string;
  place: number;
  runnerName: string;
  clubName: string | null | undefined;
};

/** A timed result row before category places are assigned. */
export type TimedTeamResult = {
  categoryId: string;
  categoryName?: string;
  time: number;
  runnerName: string;
  clubName: string | null | undefined;
};

export type CountedPerformance = {
  runnerName: string;
  categoryId: string;
  categoryName: string;
  place: number;
  points: number;
};

export type TeamStanding = {
  /** Official rank; null when the team is unclassified (fewer than MIN_FINISHERS). */
  rank: number | null;
  /** Exact trimmed club name from the list. */
  team: string;
  points: number;
  finishers: number;
  counted: CountedPerformance[];
  classified: boolean;
};

export type TeamCompetition = {
  official: TeamStanding[];
  unclassified: TeamStanding[];
};

/** Team key: trim only. Empty / placeholder names are not a team. */
export function teamKey(clubName: string | null | undefined): string | null {
  const trimmed = (clubName ?? "").trim();
  if (!trimmed || isNoClub(trimmed)) return null;
  return trimmed;
}

export function finishersFromTimedResults(rows: readonly TimedTeamResult[]): TeamFinisher[] {
  const places = categoryPlaces(rows);
  return rows.map((row, index) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName ?? row.categoryId,
    place: places[index]!,
    runnerName: row.runnerName,
    clubName: row.clubName,
  }));
}

function compareCounted(a: CountedPerformance, b: CountedPerformance): number {
  if (b.points !== a.points) return b.points - a.points;
  if (a.place !== b.place) return a.place - b.place;
  return a.runnerName.localeCompare(b.runnerName, "cs");
}

function placeCounts(counted: readonly CountedPerformance[]): number[] {
  let max = 0;
  for (const item of counted) if (item.place > max) max = item.place;
  const counts = Array.from({ length: max }, () => 0);
  for (const item of counted) {
    if (item.place >= 1) counts[item.place - 1]! += 1;
  }
  return counts;
}

/** More 1sts, then more 2nds, … among counted performances. 0 = identical series. */
export function comparePlaceSeries(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return right - left;
  }
  return 0;
}

function compareOfficial(a: TeamStanding, b: TeamStanding): number {
  if (b.points !== a.points) return b.points - a.points;
  const series = comparePlaceSeries(placeCounts(a.counted), placeCounts(b.counted));
  if (series !== 0) return series;
  return a.team.localeCompare(b.team, "cs");
}

function sortCounted(counted: CountedPerformance[]): CountedPerformance[] {
  return [...counted].sort(
    (a, b) => a.place - b.place || a.categoryName.localeCompare(b.categoryName, "cs"),
  );
}

/**
 * Compute official and unclassified team standings from classified finishers
 * (runners who already have a category place, typically those with a finish time).
 */
export function computeTeamCompetition(finishers: readonly TeamFinisher[]): TeamCompetition {
  type Acc = {
    team: string;
    finishers: number;
    byCategory: Map<string, CountedPerformance[]>;
  };
  const teams = new Map<string, Acc>();

  for (const row of finishers) {
    const key = teamKey(row.clubName);
    if (!key) continue;
    let acc = teams.get(key);
    if (!acc) {
      acc = { team: key, finishers: 0, byCategory: new Map() };
      teams.set(key, acc);
    }
    acc.finishers += 1;
    const points = pointsForPlace(row.categoryId, row.place);
    if (points <= 0) continue;
    const performance: CountedPerformance = {
      runnerName: row.runnerName,
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? row.categoryId,
      place: row.place,
      points,
    };
    const list = acc.byCategory.get(row.categoryId) ?? [];
    list.push(performance);
    acc.byCategory.set(row.categoryId, list);
  }

  const standings: TeamStanding[] = [];
  for (const acc of teams.values()) {
    const counted: CountedPerformance[] = [];
    for (const list of acc.byCategory.values()) {
      const best = [...list].sort(compareCounted)[0];
      if (best) counted.push(best);
    }
    const classified = acc.finishers >= MIN_FINISHERS;
    standings.push({
      rank: null,
      team: acc.team,
      points: counted.reduce((sum, item) => sum + item.points, 0),
      finishers: acc.finishers,
      counted: sortCounted(counted),
      classified,
    });
  }

  const official = standings.filter((row) => row.classified).sort(compareOfficial);
  official.forEach((row, index) => {
    if (index > 0) {
      const previous = official[index - 1]!;
      const samePoints = row.points === previous.points;
      const sameSeries =
        comparePlaceSeries(placeCounts(row.counted), placeCounts(previous.counted)) === 0;
      if (samePoints && sameSeries) {
        row.rank = previous.rank;
        return;
      }
    }
    row.rank = index + 1;
  });

  const unclassified = standings
    .filter((row) => !row.classified)
    .sort(
      (a, b) =>
        b.points - a.points || b.finishers - a.finishers || a.team.localeCompare(b.team, "cs"),
    );

  return { official, unclassified };
}

export type TeamYearWinner = {
  year: number;
  rank: number;
  team: string;
  points: number;
  finishers: number;
  tied: boolean;
};

/** Official first place (all teams sharing rank 1) for a closed edition. */
export function winnersOf(competition: TeamCompetition, year: number): TeamYearWinner[] {
  return competition.official
    .filter((row) => row.rank === 1)
    .map((row) => ({
      year,
      rank: 1,
      team: row.team,
      points: row.points,
      finishers: row.finishers,
      tied: competition.official.filter((item) => item.rank === 1).length > 1,
    }));
}

/** Top N official rows, including every team that shares the last included rank. */
export function officialPodium(competition: TeamCompetition, depth = 3): TeamStanding[] {
  const last = competition.official.find((row) => (row.rank ?? 0) > depth);
  const cutoff = last ? competition.official.indexOf(last) : competition.official.length;
  return competition.official.slice(0, cutoff);
}
