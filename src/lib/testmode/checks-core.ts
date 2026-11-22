/**
 * Kontroly konzistence po testu (Q10: bez ruční „pravdy“ testerů) – report jen v administraci.
 * Vstup: testovací startovka, evidence startu a mezičasy stínového ročníku. Čistá logika.
 */
export type CheckSplit = { bib: number; split: string; time: number };
export type CheckIssue =
  | { kind: "duplicate_bib"; bib: number }
  | { kind: "unknown_bib"; bib: number; split: string }
  | { kind: "negative_time"; bib: number; split: string; time: number }
  | { kind: "not_increasing"; bib: number; split: string; time: number; before: number }
  | { kind: "finish_without_start"; bib: number }
  | { kind: "missing_split"; bib: number; split: string }
  | { kind: "started_no_finish"; bib: number };

export type CheckReport = {
  roster: number;
  started: number;
  finished: number;
  issues: CheckIssue[];
  ok: boolean;
};

/**
 * @param order kódy mezičasů podle pozice na trati (bez cíle).
 * @param ended test skončil → kdo odstartoval a nemá cíl, je hlášen.
 */
export function consistencyChecks(input: {
  rosterBibs: readonly number[];
  startedBibs: readonly number[];
  splits: readonly CheckSplit[];
  order: readonly string[];
  finish: string;
  ended: boolean;
}): CheckReport {
  const issues: CheckIssue[] = [];
  const roster = new Set<number>();
  for (const bib of input.rosterBibs) {
    if (roster.has(bib)) issues.push({ kind: "duplicate_bib", bib });
    roster.add(bib);
  }
  const started = new Set(input.startedBibs);
  const byBib = new Map<number, Map<string, number>>();
  for (const s of input.splits) {
    if (!roster.has(s.bib)) {
      issues.push({ kind: "unknown_bib", bib: s.bib, split: s.split });
      continue;
    }
    if (s.time < 0) {
      issues.push({ kind: "negative_time", bib: s.bib, split: s.split, time: s.time });
      continue;
    }
    const m = byBib.get(s.bib) ?? new Map<string, number>();
    m.set(s.split, s.time);
    byBib.set(s.bib, m);
  }
  const points = [...input.order, input.finish];
  let finished = 0;
  for (const bib of [...roster].sort((a, b) => a - b)) {
    const m = byBib.get(bib);
    if (m?.has(input.finish)) {
      finished += 1;
      if (!started.has(bib)) issues.push({ kind: "finish_without_start", bib });
      for (const code of input.order) {
        if (!m.has(code)) issues.push({ kind: "missing_split", bib, split: code });
      }
    } else if (input.ended && started.has(bib)) {
      issues.push({ kind: "started_no_finish", bib });
    }
    let last: number | null = null;
    for (const code of points) {
      const t = m?.get(code);
      if (t === undefined) continue;
      if (last !== null && t <= last) {
        issues.push({ kind: "not_increasing", bib, split: code, time: t, before: last });
      }
      last = t;
    }
  }
  return {
    roster: roster.size,
    started: [...started].filter((b) => roster.has(b)).length,
    finished,
    issues,
    ok: issues.length === 0,
  };
}
