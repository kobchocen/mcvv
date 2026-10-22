/**
 * /statistiky landing page ("Přehled"): all-time numbers computed from every result row.
 * Pure (no DB access) so it can be unit-tested; see getStatsOverview() for the cached loader.
 * All values are plain JSON (unstable_cache serializes the result).
 */
import {
  createClubResolver,
  mostCommonSpelling,
  normalizeClubName,
  type ClubResolver,
} from "@/lib/clubs/core";
import {
  personalRecordsByYear,
  runnerBirthYear,
  runnerSex,
  type RawResult,
} from "@/lib/stats/core";

/** All categories run the same course. */
export const COURSE_KM = 4.3;
/** Elevation gain of one lap of the course. */
export const COURSE_CLIMB_M = 200;
/**
 * Finisher ages for "Nejstarší a nejmladší v cíli". Runner ids encode the birth year
 * (age = race year − birth year). There is no minimum age; only invalid values are skipped:
 * a missing / non-numeric birth year or an age of 0 or less (birth year in or after the race
 * year). Ages above 99 are ignored as implausible.
 */
export const MAX_PLAUSIBLE_AGE = 99;

export type Sex = "M" | "F";

export type Performance = { runnerId: string; name: string; year: number; time: number };

export type Duel = { year: number; gap: number; first: Performance; second: Performance };

export type WinsLeader = {
  count: number;
  runners: { runnerId: string; name: string; firstYear: number; lastYear: number }[];
};

export type RankedRow = { rank: number; runnerId: string; name: string; value: number };

export type StatsOverview = {
  firstYear: number;
  lastYear: number;
  editions: number;
  starts: number;
  runners: number;
  km: number;
  courseRecords: Record<Sex, Performance | null>;
  mostWins: Record<Sex, WinsLeader | null>;
  photos: { leaders: RankedRow[]; total: number };
  closestFinish: Record<Sex, Duel | null>;
  largestMargin: Record<Sex, Duel | null>;
  personalRecords: {
    year: number;
    count: number;
    best: (Performance & { previous: number; improvement: number }) | null;
  } | null;
  ageExtremes: {
    oldest: (Performance & { age: number }) | null;
    youngest: (Performance & { age: number }) | null;
  };
  recordEdition: {
    year: number;
    count: number;
    newcomers: number;
    personalRecords: number;
    bars: { year: number; count: number }[];
  } | null;
  women: {
    share: number;
    trend: { year: number; share: number }[];
    peak: { year: number; share: number } | null;
  };
  /** Canonical club when merged in the admin (#104), else the written name. */
  clubs: { name: string; slug: string; starts: number }[];
  together: { seconds: number; hours: number; days: number; climbKm: number };
};

export type PhotoCount = { runnerId: string; name: string; count: number };

const SEXES: Sex[] = ["M", "F"];

function perf(row: RawResult): Performance {
  return { runnerId: row.runnerId, name: row.runnerName || "—", year: row.year, time: row.time };
}

/** Competition ranking (1, 1, 3 …) of rows sorted by value descending. */
export function rankRows<T extends { value: number }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  return sorted.map((row, index) => {
    let rank = index + 1;
    for (let i = index - 1; i >= 0 && sorted[i].value === row.value; i -= 1) {
      rank = i + 1;
    }
    return { ...row, rank };
  });
}

/**
 * Club key for grouping starts: case, diacritics, punctuation and spaces are ignored
 * ("K.O.B. Choceň" = "KOB Chocen"). Different spellings or renamed clubs are still counted
 * separately – the result is an approximation until club names are unified (#104).
 */
export { normalizeClubName };

function sortedByTime(rows: RawResult[]): RawResult[] {
  return [...rows].sort((a, b) => a.time - b.time || a.runnerId.localeCompare(b.runnerId));
}

export function computeStatsOverview(
  results: RawResult[],
  photoCounts: PhotoCount[] = [],
  photoTotal = 0,
  clubResolver: ClubResolver = createClubResolver(),
): StatsOverview {
  const years = [...new Set(results.map((row) => row.year))].sort((a, b) => a - b);
  const byYear = new Map<number, RawResult[]>();
  for (const row of results) {
    const list = byYear.get(row.year) ?? [];
    list.push(row);
    byYear.set(row.year, list);
  }
  const starts = results.length;
  const runnerIds = new Set(results.map((row) => row.runnerId));
  const totalSeconds = results.reduce((sum, row) => sum + row.time, 0);

  // Course records (fastest time ever per sex).
  const courseRecords = { M: null, F: null } as Record<Sex, Performance | null>;
  for (const sex of SEXES) {
    const fastest = sortedByTime(results.filter((row) => runnerSex(row.runnerId) === sex))[0];
    courseRecords[sex] = fastest ? perf(fastest) : null;
  }

  // Absolute winners and 1st–2nd gaps per year and sex.
  const wins = { M: new Map<string, number[]>(), F: new Map<string, number[]>() };
  const names = new Map<string, string>();
  const duels: Record<Sex, Duel[]> = { M: [], F: [] };
  for (const year of years) {
    for (const sex of SEXES) {
      const ordered = sortedByTime(
        (byYear.get(year) ?? []).filter((row) => runnerSex(row.runnerId) === sex),
      );
      const [first, second] = ordered;
      if (!first) {
        continue;
      }
      names.set(first.runnerId, first.runnerName || "—");
      const list = wins[sex].get(first.runnerId) ?? [];
      list.push(year);
      wins[sex].set(first.runnerId, list);
      if (second) {
        duels[sex].push({
          year,
          gap: second.time - first.time,
          first: perf(first),
          second: perf(second),
        });
      }
    }
  }
  const mostWins = { M: null, F: null } as Record<Sex, WinsLeader | null>;
  const closestFinish = { M: null, F: null } as Record<Sex, Duel | null>;
  const largestMargin = { M: null, F: null } as Record<Sex, Duel | null>;
  for (const sex of SEXES) {
    const counts = [...wins[sex].entries()];
    const max = counts.reduce((best, [, list]) => Math.max(best, list.length), 0);
    if (max > 0) {
      mostWins[sex] = {
        count: max,
        runners: counts
          .filter(([, list]) => list.length === max)
          .map(([runnerId, list]) => ({
            runnerId,
            name: names.get(runnerId) ?? "—",
            firstYear: Math.min(...list),
            lastYear: Math.max(...list),
          }))
          .sort((a, b) => a.firstYear - b.firstYear),
      };
    }
    // Ties: the most recent edition wins.
    closestFinish[sex] = duels[sex].reduce<Duel | null>(
      (best, duel) =>
        !best || duel.gap < best.gap || (duel.gap === best.gap && duel.year > best.year)
          ? duel
          : best,
      null,
    );
    largestMargin[sex] = duels[sex].reduce<Duel | null>(
      (best, duel) =>
        !best || duel.gap > best.gap || (duel.gap === best.gap && duel.year > best.year)
          ? duel
          : best,
      null,
    );
  }

  // Personal records (same definition as the attendance page).
  const prs = personalRecordsByYear(results);
  let personalRecords: StatsOverview["personalRecords"] = null;
  for (const year of years) {
    const events = prs.get(year) ?? [];
    if (!personalRecords || events.length > personalRecords.count) {
      personalRecords = { year, count: events.length, best: null };
    }
  }
  if (personalRecords) {
    const prYear = personalRecords.year;
    const improved = (prs.get(prYear) ?? [])
      .filter((event) => event.previous !== null)
      .map((event) => ({ ...event, improvement: (event.previous ?? 0) - event.time }))
      .sort((a, b) => b.improvement - a.improvement || a.time - b.time)[0];
    if (improved) {
      const row = (byYear.get(prYear) ?? []).find((r) => r.runnerId === improved.runnerId);
      personalRecords.best = {
        runnerId: improved.runnerId,
        name: row?.runnerName || "—",
        year: prYear,
        time: improved.time,
        previous: improved.previous ?? improved.time,
        improvement: improved.improvement,
      };
    }
  }

  // Oldest and youngest finisher (valid ages only, no minimum age).
  let oldest: (Performance & { age: number }) | null = null;
  let youngest: (Performance & { age: number }) | null = null;
  for (const row of results) {
    const born = runnerBirthYear(row.runnerId);
    const age = row.year - born;
    if (!Number.isFinite(born) || born <= 0 || age <= 0 || age > MAX_PLAUSIBLE_AGE) {
      continue;
    }
    if (!oldest || age > oldest.age || (age === oldest.age && row.time < oldest.time)) {
      oldest = { ...perf(row), age };
    }
    if (!youngest || age < youngest.age || (age === youngest.age && row.time < youngest.time)) {
      youngest = { ...perf(row), age };
    }
  }

  // Attendance per year.
  const firstYear = new Map<string, number>();
  for (const row of results) {
    const first = firstYear.get(row.runnerId);
    if (first === undefined || row.year < first) {
      firstYear.set(row.runnerId, row.year);
    }
  }
  const bars = years.map((year) => ({ year, count: byYear.get(year)?.length ?? 0 }));
  const top = bars.reduce<{ year: number; count: number } | null>(
    (best, bar) => (!best || bar.count > best.count ? bar : best),
    null,
  );
  const recordEdition: StatsOverview["recordEdition"] = top
    ? {
        year: top.year,
        count: top.count,
        newcomers: (byYear.get(top.year) ?? []).filter(
          (row) => firstYear.get(row.runnerId) === top.year,
        ).length,
        personalRecords: prs.get(top.year)?.length ?? 0,
        bars,
      }
    : null;

  // Women on the course.
  const womenStarts = results.filter((row) => runnerSex(row.runnerId) === "F").length;
  const trend = years.map((year) => {
    const list = byYear.get(year) ?? [];
    const women = list.filter((row) => runnerSex(row.runnerId) === "F").length;
    return { year, share: list.length ? women / list.length : 0 };
  });
  const peak = trend.reduce<{ year: number; share: number } | null>(
    (best, point) => (!best || point.share > best.share ? point : best),
    null,
  );

  // Most loyal club: canonical club once merged in the admin, else the written name
  // (case, diacritics and punctuation ignored).
  const clubs = new Map<
    string,
    { starts: number; slug: string; canonical: string | null; spellings: Map<string, number> }
  >();
  for (const row of results) {
    const resolved = clubResolver.resolve(row.clubName);
    if (!resolved) {
      continue;
    }
    const entry = clubs.get(resolved.key) ?? {
      starts: 0,
      slug: resolved.slug,
      canonical: resolved.canonicalName,
      spellings: new Map<string, number>(),
    };
    entry.starts += 1;
    const spelling = (row.clubName ?? "").trim();
    entry.spellings.set(spelling, (entry.spellings.get(spelling) ?? 0) + 1);
    clubs.set(resolved.key, entry);
  }
  const topClubs = [...clubs.values()]
    .map((entry) => {
      const name = entry.canonical ?? mostCommonSpelling(entry.spellings);
      return {
        name,
        slug: entry.canonical ? entry.slug : (clubResolver.resolve(name)?.slug ?? entry.slug),
        starts: entry.starts,
      };
    })
    .sort((a, b) => b.starts - a.starts || a.name.localeCompare(b.name, "cs"))
    .slice(0, 3);

  const hours = totalSeconds / 3600;
  return {
    firstYear: years[0] ?? 0,
    lastYear: years.at(-1) ?? 0,
    editions: years.length,
    starts,
    runners: runnerIds.size,
    km: Math.round(starts * COURSE_KM),
    courseRecords,
    mostWins,
    photos: {
      leaders: rankRows(
        photoCounts.map((row) => ({ runnerId: row.runnerId, name: row.name, value: row.count })),
      ).slice(0, 5),
      total: photoTotal,
    },
    closestFinish,
    largestMargin,
    personalRecords,
    ageExtremes: { oldest, youngest },
    recordEdition,
    women: { share: starts ? womenStarts / starts : 0, trend, peak },
    clubs: topClubs,
    together: {
      seconds: totalSeconds,
      hours: Math.round(hours),
      days: Math.round(hours / 24),
      climbKm: Math.round((starts * COURSE_CLIMB_M) / 1000),
    },
  };
}
