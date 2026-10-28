/**
 * Results of one club in one edition (#197): the club profile's "click on a year". Overall
 * and category ranks are computed from the whole edition, then only the club's rows are kept.
 * Pure; ties share a rank (as on /results/[year]).
 */
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
  /** Overall rank in the edition (all runners, both sexes). */
  rank: number;
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
  const overall = ranks(edition);
  const byCategory = new Map<string, EditionResultRow[]>();
  for (const row of edition) {
    const group = byCategory.get(row.categoryId) ?? [];
    group.push(row);
    byCategory.set(row.categoryId, group);
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
      categoryId: row.categoryId,
      categoryName: row.categoryName || row.categoryId,
      categoryRank: categoryRank.get(row)!,
    }))
    .sort((a, b) => a.time - b.time || a.runnerId.localeCompare(b.runnerId));
}
