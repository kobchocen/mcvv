/**
 * Pure helpers for the public runner profile (`/bezec/[id]`).
 *
 * A runner can exist in `cis_bezec` without any `Result` row – typically a
 * first-timer registered for the current year. The profile must still render
 * (issue #81), so every aggregate over results is guarded here.
 */

export type RunnerResultTime = Readonly<{ time: number }>;

export type RunnerResultSummary = Readonly<{
  starts: number;
  record: number;
  average: number;
}>;

/** Aggregate result times, or `null` when the runner has no results yet. */
export function summarizeRunnerResults(
  results: readonly RunnerResultTime[],
): RunnerResultSummary | null {
  const times = results.map((row) => row.time).filter((time) => Number.isFinite(time));
  if (times.length === 0) {
    return null;
  }
  return {
    starts: times.length,
    record: Math.min(...times),
    average: Math.round(times.reduce((sum, time) => sum + time, 0) / times.length),
  };
}

/** A runner profile is missing (404) only when the runner record itself is absent. */
export function isRunnerProfileMissing(runner: unknown): boolean {
  return runner === null || runner === undefined;
}
