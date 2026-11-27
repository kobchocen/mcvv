/**
 * Varování u zápisu mezičasu po plánovaném startu: číslo přijmeme, ale obsluhu upozorníme.
 * Před startem zůstává odmítnutí beze změny (řeší `checkPunch`).
 */
import { FINISH_SPLIT, isStartStation } from "./stations";

export const SPLIT_WARNINGS = ["unknown-bib", "already-finished", "not-started"] as const;
export type SplitWarning = (typeof SPLIT_WARNINGS)[number];

export type FieldBibs = {
  roster: number[];
  started: number[];
  finished: number[];
};

export const EMPTY_FIELD_BIBS: FieldBibs = { roster: [], started: [], finished: [] };

export type SplitWarningField = {
  roster: ReadonlySet<number>;
  started: ReadonlySet<number>;
  finished: ReadonlySet<number>;
};

export const EMPTY_SPLIT_WARNING_FIELD: SplitWarningField = {
  roster: new Set(),
  started: new Set(),
  finished: new Set(),
};

/** Pořadí určuje, který štítek má přednost, když platí víc důvodů. */
export function classifySplitWarning(
  bib: number,
  station: string,
  field: SplitWarningField,
): SplitWarning | null {
  if (!field.roster.has(bib)) return "unknown-bib";
  if (station !== FINISH_SPLIT && field.finished.has(bib)) return "already-finished";
  if (!isStartStation(station) && !field.started.has(bib)) return "not-started";
  return null;
}

/** Vybere hlavní varování z poznámky deníku (`unknown-bib;existing=12`). */
export function primarySplitWarning(note?: string | null): SplitWarning | null {
  if (!note) return null;
  const tokens = new Set(note.split(";"));
  for (const warning of SPLIT_WARNINGS) {
    if (tokens.has(warning)) return warning;
  }
  return null;
}

export function splitWarningStateKey(
  warning: SplitWarning,
): "unknownBib" | "alreadyFinished" | "notStarted" {
  switch (warning) {
    case "unknown-bib":
      return "unknownBib";
    case "already-finished":
      return "alreadyFinished";
    case "not-started":
      return "notStarted";
  }
}

/** Poznámka do deníku zápisu (`mcvv_split_entry.note`). */
export function webSplitNote(input: {
  knownBib: boolean;
  hadStart: boolean;
  alreadyFinished: boolean;
  station: string;
  existingTime?: number;
}): string | null {
  const warning = classifySplitWarning(1, input.station, {
    roster: new Set(input.knownBib ? [1] : []),
    started: new Set(input.hadStart ? [1] : []),
    finished: new Set(input.alreadyFinished ? [1] : []),
  });
  const notes = [
    warning,
    input.existingTime !== undefined ? `existing=${input.existingTime}` : null,
  ].filter(Boolean);
  return notes.length > 0 ? notes.join(";") : null;
}

export function fieldBibsFrom(input: {
  rosterBibs: readonly number[];
  startedBibs: ReadonlySet<number>;
  splits: readonly { bib: number; split: string }[];
}): FieldBibs {
  const finished = new Set<number>();
  for (const row of input.splits) {
    if (row.split === FINISH_SPLIT) finished.add(row.bib);
  }
  return {
    roster: [...input.rosterBibs],
    started: [...input.startedBibs],
    finished: [...finished],
  };
}

export function warningFieldFromBibs(bibs: FieldBibs): SplitWarningField {
  return {
    roster: new Set(bibs.roster),
    started: new Set(bibs.started),
    finished: new Set(bibs.finished),
  };
}
