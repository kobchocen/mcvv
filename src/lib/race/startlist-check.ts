import {
  inAnySpecialRange,
  inSpecialRange,
  isRangedSpecialKind,
  RANGED_SPECIAL_KINDS,
  type RangedSpecialKind,
  type SpecialStartKind,
} from "./special-start";
import {
  reserveIntervals,
  type BibInterval,
  type BibRange,
  type ChampionBibs,
} from "./start-settings";
import { startSeriesForBib, type StartModel } from "./start-time";

/** Řádek startovky pro kontrolu konfliktů (#116). */
export type CheckRow = {
  runnerId: string;
  categoryId: string;
  bib: number | null;
  valid: boolean;
  cancelled: boolean;
  /** Typ spec. startu (jen administrace), null = žádný. */
  specialKind: SpecialStartKind | null;
};

export type StartListIssue =
  | { code: "duplicate"; bib: number; runnerIds: string[] }
  | { code: "invalidWithBib"; bib: number; runnerId: string }
  | { code: "missingBib"; runnerId: string }
  /** Spec. start s rozsahem má číslo mimo svůj rozsah (rozsah je plný nebo ruční úprava, Q237). */
  | { code: "specOutsideRange"; kind: RangedSpecialKind; runnerIds: string[] };

export function bibInRange(ranges: BibRange[], categoryId: string, bib: number): boolean {
  const range = ranges.find((r) => r.categoryId === categoryId);
  return !!range && bib >= range.bibFrom && bib <= range.bibTo;
}

/**
 * Číslo mimo okno vlastní kategorie (kategorie není dogma – všichni běží stejnou trať). Není to
 * chyba, jen informativní štítek „mimo kategorii“. Čísla obhájců, spec. starty s rozsahem
 * (pořadatel, brzy, pozdě) a „spolu s“ v rozsahu spec. startů se nepočítají.
 */
export function outsideCategory(
  model: StartModel,
  ranges: BibRange[],
  champions: ChampionBibs,
  row: Pick<CheckRow, "categoryId" | "bib"> & { specialKind?: SpecialStartKind | null },
): boolean {
  if (row.bib == null) {
    return false;
  }
  return !(
    bibInRange(ranges, row.categoryId, row.bib) ||
    row.bib === champions.men ||
    row.bib === champions.women ||
    isRangedSpecialKind(row.specialKind) ||
    (row.specialKind === "with" && inAnySpecialRange(model, row.bib))
  );
}

export function checkStartList(model: StartModel, rows: CheckRow[]): StartListIssue[] {
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
  for (const kind of RANGED_SPECIAL_KINDS) {
    const outside = active
      .filter(
        (row) =>
          row.valid &&
          row.specialKind === kind &&
          row.bib != null &&
          !inSpecialRange(model, kind, row.bib),
      )
      .sort((a, b) => a.bib! - b.bib!)
      .map((row) => row.runnerId);
    if (outside.length > 0) {
      issues.push({ code: "specOutsideRange", kind, runnerIds: outside });
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
