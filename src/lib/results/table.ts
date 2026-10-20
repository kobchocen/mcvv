import { formatRaceTime } from "@/lib/utils";

/** Split ids shown in the results tables: "1" = first split, "3" = second split. */
export const SPLIT_IDS = ["1", "3"] as const;

export type SplitTimes = { split1: number | null; split2: number | null };

export function pickSplits(splits: ReadonlyArray<{ split: string; time: number }>): SplitTimes {
  return {
    split1: splits.find((s) => s.split === SPLIT_IDS[0])?.time ?? null,
    split2: splits.find((s) => s.split === SPLIT_IDS[1])?.time ?? null,
  };
}

/** Mobile 3rd line, e.g. "M1 12:34 · M2 25:01"; empty when the runner has no splits. */
export function splitsLine(splits: SplitTimes, labels: { split1: string; split2: string }): string {
  return [
    splits.split1 != null ? `${labels.split1} ${formatRaceTime(splits.split1)}` : null,
    splits.split2 != null ? `${labels.split2} ${formatRaceTime(splits.split2)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Mobile 2nd line: "Klub" or, in the overall view, "Klub · M40 (3.)". */
export function detailLine(club: string, category?: string | null): string {
  return category ? `${club} · ${category}` : club;
}

/** The splits toggle only makes sense for years that have split data. */
export function yearHasSplits(splitCount: number): boolean {
  return splitCount > 0;
}
