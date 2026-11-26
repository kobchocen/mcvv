/**
 * Počty pro informační boxy na obrazovce Mezičasy: kdo čeká, kdo už běžel, kdo je
 * na předchozím úseku, kdo prošel touto kontrolou a kdo je v cíli.
 */
import { byPosition, FINISH_SPLIT, isStartStation, type Station } from "./stations";

export type FieldCounts = {
  waitingStart: number;
  started: number;
  previousSegment: number;
  passedHere: number;
  finished: number;
};

export const EMPTY_FIELD_COUNTS: FieldCounts = {
  waitingStart: 0,
  started: 0,
  previousSegment: 0,
  passedHere: 0,
  finished: 0,
};

export type FieldSplit = { bib: number; split: string };

/**
 * `previousSegment` = prošli předchozí kontrolou (u prvního mezičasu odstartovali),
 * ještě tu nejsou a neobjevili se na pozdějším bodě ani v cíli.
 */
export function fieldCounts(input: {
  station: string;
  stations: readonly Station[];
  rosterBibs: readonly number[];
  startedBibs: ReadonlySet<number>;
  splits: readonly FieldSplit[];
}): FieldCounts {
  const roster = new Set(input.rosterBibs);
  const seen = new Map<number, Set<string>>();
  for (const row of input.splits) {
    const set = seen.get(row.bib) ?? new Set<string>();
    set.add(row.split);
    seen.set(row.bib, set);
  }
  const hasStarted = (bib: number) => input.startedBibs.has(bib) || (seen.get(bib)?.size ?? 0) > 0;

  let started = 0;
  let finished = 0;
  for (const bib of roster) {
    if (hasStarted(bib)) started += 1;
    if (seen.get(bib)?.has(FINISH_SPLIT)) finished += 1;
  }

  const course = byPosition(input.stations.filter((station) => !isStartStation(station.code)));
  const codes = course.map((station) => station.code);
  const atStart = isStartStation(input.station);

  let passedHere = 0;
  if (atStart) {
    for (const bib of roster) {
      if (input.startedBibs.has(bib)) passedHere += 1;
    }
  } else {
    const punched = new Set(
      input.splits
        .filter((row) => row.split === input.station && roster.has(row.bib))
        .map((row) => row.bib),
    );
    passedHere = punched.size;
  }

  let previousSegment = 0;
  if (!atStart) {
    const index = codes.indexOf(input.station);
    const later = index >= 0 ? [...codes.slice(index + 1), FINISH_SPLIT] : [FINISH_SPLIT];
    const previous = index > 0 ? codes[index - 1] : null;
    for (const bib of roster) {
      if (!hasStarted(bib)) continue;
      const got = seen.get(bib) ?? new Set<string>();
      if (got.has(input.station)) continue;
      if (later.some((code) => got.has(code))) continue;
      if (previous === null || got.has(previous)) previousSegment += 1;
    }
  }

  return {
    waitingStart: roster.size - started,
    started,
    previousSegment,
    passedHere,
    finished,
  };
}
