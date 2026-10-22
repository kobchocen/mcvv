/** Pure statistics helpers (no DB access) shared by queries, pages and tests. */

export const STAT_SLUGS = ["rekordy", "vitezove", "casy", "vek", "veterani", "ucast"] as const;
export type StatSlug = (typeof STAT_SLUGS)[number];

export function isStatSlug(value: string): value is StatSlug {
  return (STAT_SLUGS as readonly string[]).includes(value);
}

export type RawResult = {
  year: number;
  time: number;
  runnerId: string;
  runnerName: string | null;
  /** cis_klub.id – identity of the club (#104). */
  clubId: string | null;
  /** Name of that id in the edition (cis_klub.jmeno), as written. */
  clubName: string | null;
};

export function runnerSex(id: string): "M" | "F" {
  return id.charAt(4) < "5" ? "M" : "F";
}

export function runnerBirthYear(id: string): number {
  return Number(id.slice(0, 4));
}

export type PersonalRecordEvent = {
  year: number;
  runnerId: string;
  time: number;
  /** Previous personal best; null for a first start (also counted as a PB, see Účast). */
  previous: number | null;
};

/**
 * Personal records per year, as on the attendance page: a start is a PB when it is the
 * runner's first one or faster than all previous starts.
 */
export function personalRecordsByYear(
  results: Pick<RawResult, "year" | "runnerId" | "time">[],
): Map<number, PersonalRecordEvent[]> {
  const years = [...new Set(results.map((row) => row.year))].sort((a, b) => a - b);
  const byYear = new Map<number, Pick<RawResult, "year" | "runnerId" | "time">[]>();
  for (const row of results) {
    const list = byYear.get(row.year) ?? [];
    list.push(row);
    byYear.set(row.year, list);
  }
  const bestSoFar = new Map<string, number>();
  const events = new Map<number, PersonalRecordEvent[]>();
  for (const year of years) {
    const list: PersonalRecordEvent[] = [];
    for (const row of byYear.get(year) ?? []) {
      const previous = bestSoFar.get(row.runnerId);
      if (previous === undefined || row.time < previous) {
        list.push({ year, runnerId: row.runnerId, time: row.time, previous: previous ?? null });
        bestSoFar.set(row.runnerId, row.time);
      }
    }
    events.set(year, list);
  }
  return events;
}
