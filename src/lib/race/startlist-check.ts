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
  | { code: "invalidWithBib"; bib: number; runnerId: string }
  | { code: "missingBib"; runnerId: string }
  | { code: "groupSplit"; groupId: number; kind: StartGroupKind };

export function bibInRange(ranges: BibRange[], categoryId: string, bib: number): boolean {
  const range = ranges.find((r) => r.categoryId === categoryId);
  return !!range && bib >= range.bibFrom && bib <= range.bibTo;
}

/**
 * Číslo mimo okno vlastní kategorie (kategorie není dogma – všichni běží stejnou trať). Není to
 * chyba, jen informativní štítek „mimo kategorii“. Čísla obhájců a pořadatel / spec. start v
 * bloku pořadatelů se nepočítají.
 */
export function outsideCategory(
  model: StartModel,
  ranges: BibRange[],
  champions: ChampionBibs,
  row: Pick<CheckRow, "categoryId" | "bib" | "organizer"> & {
    /** Spec. start (pořadatel / brzy / spolu s pořadatelem) smí ležet v bloku pořadatelů. */
    specialKind?: string | null;
  },
): boolean {
  if (row.bib == null) {
    return false;
  }
  return !(
    bibInRange(ranges, row.categoryId, row.bib) ||
    row.bib === champions.men ||
    row.bib === champions.women ||
    ((row.organizer || row.specialKind != null) && inOrganizerBlock(model, ranges, row.bib))
  );
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
    // Společný start: dva paralelní starty → nejvýš dva na jeden čas, další po dvojicích hned
    // za nimi (3 členové = časy t, t, t+1). Navazující: časy hned po sobě v pořadí skupiny.
    const ok =
      group.kind === "joint"
        ? Math.max(...slots) - Math.min(...slots) <= Math.ceil(slots.length / 2) - 1
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
