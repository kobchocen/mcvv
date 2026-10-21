import type { getTranslations } from "next-intl/server";

import { decodeStartIssues } from "@/lib/race/start-settings";

import type { McvvAdminStartModelCopy } from "./mcvv-admin-start-model-fields";

type StartAdminT = Awaited<ReturnType<typeof getTranslations<"StartAdmin">>>;

type IssueKey =
  | "issue_zero"
  | "issue_interval"
  | "issue_secondStart"
  | "issue_rangeOrder"
  | "issue_rangeSeries"
  | "issue_rangeOverlap"
  | "issue_championInRange"
  | "issue_championSame";

/** Texty sekce „Model startu“ včetně chyb validace z `?chyba=`. */
export function startModelCopy(
  t: StartAdminT,
  rawIssues: string | undefined,
  rangesFromDictionary: boolean,
): McvvAdminStartModelCopy {
  return {
    heading: t("editionHeading"),
    hint: t("editionHint"),
    zero: t("editionZero"),
    interval: t("editionInterval"),
    secondStart: t("editionSecondStart"),
    championMen: t("editionChampionMen"),
    championWomen: t("editionChampionWomen"),
    rangesHeading: t("editionRanges"),
    rangesHint: rangesFromDictionary
      ? `${t("editionRangesHint")} ${t("editionRangesDefault")}`
      : t("editionRangesHint"),
    colCategory: t("colCategory"),
    colFrom: t("colFrom"),
    colTo: t("colTo"),
    colStart: t("colStart"),
    colTimes: t("colTimes"),
    series: (n) => t("series", { n }),
    errors: decodeStartIssues(rawIssues).map((issue) =>
      t(`issue_${issue.code}` as IssueKey, {
        category: issue.category ?? "",
        other: issue.other ?? "",
      }),
    ),
  };
}
