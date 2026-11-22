/**
 * Results of one club in one edition (#197): the club profile's "click on a year".
 * Overall ranks are computed within each sex from the whole edition, category ranks
 * from the category; then only the club's rows are kept. Pure; ties share a rank
 * (as on /results/[year]).
 */
import { runnerSex } from "@/lib/stats/core";

import type { ClubResolver } from "./core";

export type EditionResultRow = {
  runnerId: string;
  runnerName: string | null;
  time: number;
  categoryId: string;
  categoryName: string | null;
  clubId: string | null;
  clubName: string | null;
};

export type ClubYearResult = {
  runnerId: string;
  name: string;
  time: number;
  /** Overall rank within the runner's sex (all finishers of that sex in the edition). */
  rank: number;
  sex: "M" | "F";
  categoryId: string;
  categoryName: string;
  categoryRank: number;
};

/** 1-based ranks by time; equal times share the rank. Input order is irrelevant. */
function ranks<T extends { time: number; runnerId: string }>(rows: readonly T[]): Map<T, number> {
  const sorted = [...rows].sort((a, b) => a.time - b.time || a.runnerId.localeCompare(b.runnerId));
  const out = new Map<T, number>();
  sorted.forEach((row, index) => {
    const previous = sorted[index - 1];
    out.set(row, previous && previous.time === row.time ? out.get(previous)! : index + 1);
  });
  return out;
}

export function computeClubYearResults(
  edition: readonly EditionResultRow[],
  resolver: ClubResolver,
  mainId: string,
  year: number,
): ClubYearResult[] {
  const bySex: Record<"M" | "F", EditionResultRow[]> = { M: [], F: [] };
  const byCategory = new Map<string, EditionResultRow[]>();
  for (const row of edition) {
    bySex[runnerSex(row.runnerId)].push(row);
    const group = byCategory.get(row.categoryId) ?? [];
    group.push(row);
    byCategory.set(row.categoryId, group);
  }
  const overall = new Map<EditionResultRow, number>();
  for (const group of Object.values(bySex)) {
    for (const [row, rank] of ranks(group)) overall.set(row, rank);
  }
  const categoryRank = new Map<EditionResultRow, number>();
  for (const group of byCategory.values()) {
    for (const [row, rank] of ranks(group)) categoryRank.set(row, rank);
  }
  return edition
    .filter((row) => resolver.resolve(row.clubId, year, row.clubName)?.mainId === mainId)
    .map((row) => ({
      runnerId: row.runnerId,
      name: row.runnerName || "—",
      time: row.time,
      rank: overall.get(row)!,
      sex: runnerSex(row.runnerId),
      categoryId: row.categoryId,
      categoryName: row.categoryName || row.categoryId,
      categoryRank: categoryRank.get(row)!,
    }))
    .sort((a, b) => a.time - b.time || a.runnerId.localeCompare(b.runnerId));
}
