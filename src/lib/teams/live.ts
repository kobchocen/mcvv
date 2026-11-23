import { computeTeamCompetition, finishersFromTimedResults, type TeamCompetition } from "./scoring";

/** Minimal online snapshot fields needed to score the live team competition. */
export type LiveTeamRunner = {
  cat: string;
  name: string;
  fin: number | null;
  club: number | null;
};

export type LiveTeamClub = { name: string };

export type LiveTeamCategory = { id: string; name: string };

export type LiveTeamSource = {
  runners: readonly LiveTeamRunner[];
  clubs: readonly LiveTeamClub[];
  categories: readonly LiveTeamCategory[];
};

/** Classified finishers only (a finish time in the finish column). Splits do not score. */
export function liveTeamCompetition(source: LiveTeamSource): TeamCompetition {
  const names = new Map(source.categories.map((category) => [category.id, category.name]));
  const timed = source.runners
    .filter((runner) => runner.fin != null)
    .map((runner) => ({
      categoryId: runner.cat,
      categoryName: names.get(runner.cat) ?? runner.cat,
      time: runner.fin as number,
      runnerName: runner.name,
      clubName: runner.club != null ? (source.clubs[runner.club]?.name ?? null) : null,
    }));
  return computeTeamCompetition(finishersFromTimedResults(timed));
}
