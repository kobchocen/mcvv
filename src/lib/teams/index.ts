export {
  MAIN_CATEGORY_IDS,
  MAIN_POINTS,
  MIN_FINISHERS,
  OTHER_POINTS,
  categoryPlaces,
  comparePlaceSeries,
  computeTeamCompetition,
  finishersFromTimedResults,
  isMainCategoryId,
  officialPodium,
  pointsForPlace,
  teamKey,
  winnersOf,
  type CountedPerformance,
  type TeamCompetition,
  type TeamFinisher,
  type TeamStanding,
  type TeamYearWinner,
  type TimedTeamResult,
} from "./scoring";

export {
  loadAllTeamCompetitions,
  loadYearTeamCompetition,
  loadYearTeamFinishers,
  podiumList,
  winnerList,
  type YearTeamCompetition,
} from "./query";

export { getAllTeamCompetitions, getYearTeamCompetition } from "./cached";
