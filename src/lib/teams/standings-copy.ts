import type { McvvTeamStandingsCopy } from "@/components/organisms/mcvv-team-standings";

type Translator = {
  (key: string): string;
  (key: string, values: Record<string, string | number>): string;
};

/** Map the Teams message namespace onto the standings table copy. */
export function teamStandingsCopy(t: Translator): McvvTeamStandingsCopy {
  return {
    title: t("title"),
    provisionalChip: t("provisionalChip"),
    liveChip: t("liveChip"),
    officialChip: t("officialChip"),
    colRank: t("colRank"),
    colTeam: t("colTeam"),
    colPoints: t("colPoints"),
    colFinishers: t("colFinishers"),
    colCounted: t("colCounted"),
    pointsAbbr: (points) => t("pointsAbbr", { points }),
    finishersAbbr: (count) => t("finishersAbbr", { count }),
    marginPoints: (lead) => t("marginPoints", { lead }),
    marginPlaces: (team) => t("marginPlaces", { team }),
    unclassified: t("unclassified"),
    historicalNote: t("historicalNote"),
    rulesLink: t("rulesLink"),
    winnersLink: t("winnersLink"),
  };
}
