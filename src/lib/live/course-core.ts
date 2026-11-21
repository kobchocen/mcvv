/**
 * Přehled pro šéfa trati (#316): kolik lidí prošlo kterou kontrolou a kdo se objevil na
 * mezičase (nebo v cíli), aniž prošel všemi předchozími kontrolami. Čisté funkce.
 */
import { byPosition, FINISH_SPLIT, type Station } from "./stations";

export type CourseRunner = { bib: number; name: string; categoryId: string };
export type CourseSplit = { bib: number; split: string };

export type CourseSkip = {
  bib: number;
  name: string;
  categoryId: string;
  /** Kde se objevil (kód mezičasu nebo 9 = cíl). */
  at: string;
  /** Které předchozí kontroly chybí (kódy). */
  missing: string[];
};

export type CourseOverview = {
  roster: number;
  started: number;
  finished: number;
  anyCheckpoint: number;
  points: { code: string; label: string; position: number | null; passed: number }[];
  skips: CourseSkip[];
};

/**
 * Souhrn trati. Odstartoval = záznam Startu nebo jakýkoli mezičas / cíl. Vynechaná kontrola se
 * hlásí u nejvzdálenějšího bodu, kde se běžec objevil (jeden řádek na běžce).
 */
export function courseOverview(
  stations: readonly Station[],
  runners: readonly CourseRunner[],
  splits: readonly CourseSplit[],
  startedBibs: ReadonlySet<number>,
): CourseOverview {
  const ordered = byPosition(stations);
  const known = new Map(runners.map((r) => [r.bib, r]));
  const seen = new Map<number, Set<string>>();
  for (const s of splits) {
    if (!known.has(s.bib)) continue;
    const set = seen.get(s.bib) ?? new Set<string>();
    set.add(s.split);
    seen.set(s.bib, set);
  }
  const codes = ordered.map((s) => s.code);
  const route = [...codes, FINISH_SPLIT];
  let started = 0;
  let finished = 0;
  let anyCheckpoint = 0;
  const skips: CourseSkip[] = [];
  for (const runner of runners) {
    const got = seen.get(runner.bib) ?? new Set<string>();
    if (startedBibs.has(runner.bib) || got.size > 0) started += 1;
    if (got.has(FINISH_SPLIT)) finished += 1;
    if (codes.some((code) => got.has(code))) anyCheckpoint += 1;
    let furthest = -1;
    route.forEach((code, index) => {
      if (got.has(code)) furthest = index;
    });
    if (furthest <= 0) continue;
    const missing = codes.slice(0, Math.min(furthest, codes.length)).filter((c) => !got.has(c));
    if (missing.length > 0) {
      skips.push({
        bib: runner.bib,
        name: runner.name,
        categoryId: runner.categoryId,
        at: route[furthest],
        missing,
      });
    }
  }
  return {
    roster: runners.length,
    started,
    finished,
    anyCheckpoint,
    points: ordered.map((s) => ({
      code: s.code,
      label: s.label,
      position: s.position ?? null,
      passed: runners.filter((r) => seen.get(r.bib)?.has(s.code)).length,
    })),
    skips: skips.sort((a, b) => a.bib - b.bib),
  };
}
