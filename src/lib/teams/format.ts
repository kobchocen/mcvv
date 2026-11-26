import type { CountedPerformance, TeamStanding } from "./scoring";

/** First edition in which the team competition is itself official, not a back-calculation. */
export const FIRST_OFFICIAL_TEAM_YEAR = 2026;

export function isHistoricalTeamYear(year: number): boolean {
  return year < FIRST_OFFICIAL_TEAM_YEAR;
}

export function formatCountedPerformance(item: CountedPerformance): string {
  return `${item.place}. ${item.categoryName} ${item.runnerName} (${item.points})`;
}

export function formatCountedList(counted: readonly CountedPerformance[]): string {
  return counted.map(formatCountedPerformance).join("; ");
}

export type LeadMargin =
  | {
      kind: "sole";
      leader: string;
      points: number;
      finishers: number;
    }
  | {
      kind: "points";
      leader: string;
      points: number;
      finishers: number;
      second: string;
      lead: number;
    }
  | {
      kind: "places";
      leader: string;
      points: number;
      finishers: number;
      second: string;
      lead: 0;
    };

/** Leader, points, finisher count and how they sit ahead of the next official team. */
export function leadMargin(official: readonly TeamStanding[]): LeadMargin | null {
  const first = official[0];
  if (!first || first.rank == null) return null;
  const firstRank = first.rank;
  const tied = official.filter((row) => row.rank === firstRank);
  if (tied.length > 1) {
    const second = tied[1]!;
    return {
      kind: "places",
      leader: first.team,
      points: first.points,
      finishers: first.finishers,
      second: second.team,
      lead: 0,
    };
  }
  const second = official.find((row) => row.rank != null && row.rank > firstRank);
  if (!second) {
    return {
      kind: "sole",
      leader: first.team,
      points: first.points,
      finishers: first.finishers,
    };
  }
  const lead = first.points - second.points;
  if (lead > 0) {
    return {
      kind: "points",
      leader: first.team,
      points: first.points,
      finishers: first.finishers,
      second: second.team,
      lead,
    };
  }
  return {
    kind: "places",
    leader: first.team,
    points: first.points,
    finishers: first.finishers,
    second: second.team,
    lead: 0,
  };
}
