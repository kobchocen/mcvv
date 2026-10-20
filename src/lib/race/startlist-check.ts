import {
  reserveIntervals,
  type BibInterval,
  type BibRange,
  type ChampionBibs,
} from "./start-settings";
import { startSeriesForBib, startSlot, type StartModel } from "./start-time";
import type { StartGroupKind } from "./startlist-generator";

/** Řádek startovky pro kontrolu konfliktů (#116). */
export type CheckRow = {
  runnerId: string;
  categoryId: string;
  bib: number | null;
  valid: boolean;
  cancelled: boolean;
  organizer: boolean;
};

export type StartListIssue =
  | { code: "duplicate"; bib: number; runnerIds: string[] }
  | { code: "outOfRange"; bib: number; runnerId: string; categoryId: string }
  | { code: "invalidWithBib"; bib: number; runnerId: string }
  | { code: "missingBib"; runnerId: string }
  | { code: "groupSplit"; groupId: number; kind: StartGroupKind };

export function bibInRange(ranges: BibRange[], categoryId: string, bib: number): boolean {
  const range = ranges.find((r) => r.categoryId === categoryId);
  return !!range && bib >= range.bibFrom && bib <= range.bibTo;
}

/** Číslo leží v bloku pořadatelů (před prvním rozsahem kategorie svého startu). */
export function inOrganizerBlock(model: StartModel, ranges: BibRange[], bib: number): boolean {
  const series = startSeriesForBib(model, bib);
  const starts = ranges
    .filter((r) => startSeriesForBib(model, r.bibFrom) === series)
    .map((r) => r.bibFrom);
  const first = series === 1 ? 1 : model.secondStartFrom;
  return starts.length > 0 && bib >= first && bib < Math.min(...starts);
}

export function checkStartList(
  model: StartModel,
  ranges: BibRange[],
  champions: ChampionBibs,
  rows: CheckRow[],
  groups: { id: number; kind: StartGroupKind; memberIds: string[] }[],
): StartListIssue[] {
  const issues: StartListIssue[] = [];
  const active = rows.filter((row) => !row.cancelled);
  const byBib = new Map<number, string[]>();
  for (const row of active) {
    if (row.bib != null) {
      byBib.set(row.bib, [...(byBib.get(row.bib) ?? []), row.runnerId]);
    }
  }
  for (const [bib, ids] of [...byBib].sort((a, b) => a[0] - b[0])) {
    if (ids.length > 1) {
      issues.push({ code: "duplicate", bib, runnerIds: ids });
    }
  }
  const championBibs = new Set([champions.men, champions.women].filter((b) => b != null));
  for (const row of active) {
    if (row.bib == null) {
      if (row.valid) {
        issues.push({ code: "missingBib", runnerId: row.runnerId });
      }
      continue;
    }
    if (!row.valid) {
      issues.push({ code: "invalidWithBib", bib: row.bib, runnerId: row.runnerId });
    }
    const expected =
      bibInRange(ranges, row.categoryId, row.bib) ||
      championBibs.has(row.bib) ||
      (row.organizer && inOrganizerBlock(model, ranges, row.bib));
    if (!expected) {
      issues.push({
        code: "outOfRange",
        bib: row.bib,
        runnerId: row.runnerId,
        categoryId: row.categoryId,
      });
    }
  }
  const bibById = new Map(active.map((row) => [row.runnerId, row.bib]));
  for (const group of groups) {
    const slots = group.memberIds
      .map((id) => bibById.get(id))
      .filter((bib): bib is number => bib != null)
      .map((bib) => startSlot(model, bib));
    if (slots.length < 2) {
      continue;
    }
    const ok =
      group.kind === "joint"
        ? new Set(slots).size === 1
        : slots.every((slot, i) => i === 0 || slot === slots[i - 1] + 1);
    if (!ok) {
      issues.push({ code: "groupSplit", groupId: group.id, kind: group.kind });
    }
  }
  return issues;
}

export type ReserveSummary = {
  series: 1 | 2;
  intervals: BibInterval[];
  /** Kolik čísel z rezervy je už ručně přidělených. */
  used: number;
};

/** Rezerva čísel podle aktuálně přidělených čísel (viz `reserveIntervals`). */
export function reserveSummary(
  model: StartModel,
  ranges: BibRange[],
  champions: ChampionBibs,
  bibs: number[],
): ReserveSummary[] {
  return ([1, 2] as const).map((series) => {
    const seriesRanges = ranges.filter((r) => startSeriesForBib(model, r.bibFrom) === series);
    const regular = bibs.filter(
      (bib) =>
        startSeriesForBib(model, bib) === series &&
        seriesRanges.some((r) => bib >= r.bibFrom && bib <= r.bibTo),
    );
    const lastRegular = regular.length > 0 ? Math.max(...regular) : null;
    const champion = series === 1 ? champions.men : champions.women;
    const intervals = reserveIntervals(model, series, champion, lastRegular, ranges);
    const used = bibs.filter((bib) =>
      intervals.some((i) => bib >= i.from && (i.to == null || bib <= i.to)),
    ).length;
    return { series, intervals, used };
  });
}
