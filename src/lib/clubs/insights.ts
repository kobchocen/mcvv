/**
 * Public club insights for /kluby: streaks, loyalty, expeditions, medals and veterans.
 * A club is its id after merges (Q45); official team-competition titles are not computed here
 * and must not be summed across name variants. Individual ranks are always split by sex.
 * Pure helpers, no DB access.
 */
import { runnerSex } from "@/lib/stats/core";

import { type ClubResolver } from "./core";

export type ClubInsightInput = {
  year: number;
  runnerId: string;
  runnerName?: string | null;
  clubId: string | null;
  clubName: string | null;
  time: number;
  categoryId: string;
};

export type ClubRef = { id: string; slug: string; name: string };

export type StreakRow = ClubRef & {
  length: number;
  from: number;
  to: number;
  editions: number;
  starts: number;
};

export type LoyalRow = ClubRef & {
  editions: number;
  firstYear: number;
  lastYear: number;
  streak: number;
  starts: number;
  missed: number;
};

export type ExpeditionRow = ClubRef & { year: number; size: number };

export type MedalRow = ClubRef & {
  starts: number;
  wins: number;
  podiums: number;
  winsM: number;
  winsF: number;
  podiumsM: number;
  podiumsF: number;
};

export type VeteranClubRow = ClubRef & {
  count: number;
  examples: { runnerId: string; name: string; career: number; clubStarts: number }[];
};

export type NewcomerRow = ClubRef & { firstYear: number; starts: number };
export type ReturnRow = ClubRef & { year: number; lastBefore: number; gap: number; starts: number };
export type EfficiencyRow = ClubRef & {
  starts: number;
  wins: number;
  podiums: number;
};

export type JubileeGroup = { nth: number; clubs: LoyalRow[] };

export type ClubInsights = {
  finishers: number;
  unlinkedStarts: number;
  clubs: number;
  firstYear: number;
  lastYear: number;
  editions: number;
  veteranThreshold: number;
  veteranCount: number;
  nextYear: number;
  streaks: StreakRow[];
  loyal: LoyalRow[];
  expeditions: ExpeditionRow[];
  expeditionMax: ExpeditionRow[];
  newcomers: NewcomerRow[];
  newcomersLatestYear: number;
  newcomersLatestCount: number;
  returns: ReturnRow[];
  medals: MedalRow[];
  efficiency: EfficiencyRow[];
  veterans: VeteranClubRow[];
  jubilees: JubileeGroup[];
  clubsPerYear: { year: number; clubs: number }[];
};

const JUBILEE_NTH = [10, 20, 25, 30, 34] as const;
const EFFICIENCY_MIN_STARTS = 20;

/** Members of the veterans club: more starts than half of the editions with results. */
export function veteranThreshold(editions: number): number {
  return Math.floor(editions / 2) + 1;
}

/** Longest run of consecutive years; years must be unique. */
export function longestStreak(years: readonly number[]): {
  length: number;
  from: number;
  to: number;
} {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  if (ys.length === 0) return { length: 0, from: 0, to: 0 };
  let best = 1;
  let bestFrom = ys[0]!;
  let bestTo = ys[0]!;
  let cur = 1;
  let curFrom = ys[0]!;
  for (let i = 1; i < ys.length; i++) {
    const prev = ys[i - 1]!;
    const year = ys[i]!;
    if (year === prev + 1) {
      cur += 1;
      if (cur > best) {
        best = cur;
        bestFrom = curFrom;
        bestTo = year;
      }
    } else {
      cur = 1;
      curFrom = year;
    }
  }
  return { length: best, from: bestFrom, to: bestTo };
}

/** 1-based ranks by time; equal times share the rank. */
function ranksByTime<T extends { time: number; runnerId: string }>(
  rows: readonly T[],
): Map<T, number> {
  const sorted = [...rows].sort((a, b) => a.time - b.time || a.runnerId.localeCompare(b.runnerId));
  const out = new Map<T, number>();
  sorted.forEach((row, index) => {
    const previous = sorted[index - 1];
    out.set(row, previous && previous.time === row.time ? out.get(previous)! : index + 1);
  });
  return out;
}

function byStartsThenName(a: { starts: number; name: string; id: string }, b: typeof a) {
  return b.starts - a.starts || a.name.localeCompare(b.name, "cs") || a.id.localeCompare(b.id);
}

export function computeClubInsights(
  rows: readonly ClubInsightInput[],
  resolver: ClubResolver,
  options?: { efficiencyMinStarts?: number },
): ClubInsights {
  const minEff = options?.efficiencyMinStarts ?? EFFICIENCY_MIN_STARTS;
  const years = [...new Set(rows.map((row) => row.year))].sort((a, b) => a - b);
  const firstYear = years[0] ?? 0;
  const lastYear = years.at(-1) ?? 0;
  const editions = years.length;
  const threshold = veteranThreshold(editions);

  const unlinkedStarts = rows.filter(
    (row) => !resolver.resolve(row.clubId, row.year, row.clubName),
  ).length;

  type Agg = {
    starts: number;
    years: Set<number>;
    yearSize: Map<number, number>;
    winsM: number;
    winsF: number;
    podiumsM: number;
    podiumsF: number;
  };
  const byClub = new Map<string, Agg>();
  const runnerClub = new Map<string, Map<string, number>>();
  const career = new Map<string, number>();
  const runnerName = new Map<string, string>();

  const ranked = rows.map((row) => ({ ...row }));
  const byYearCat = new Map<string, typeof ranked>();
  for (const row of ranked) {
    const key = `${row.year}:${row.categoryId}`;
    const list = byYearCat.get(key) ?? [];
    list.push(row);
    byYearCat.set(key, list);
  }
  const catRank = new Map<(typeof ranked)[number], number>();
  for (const group of byYearCat.values()) {
    for (const [row, rank] of ranksByTime(group)) catRank.set(row, rank);
  }

  for (const row of ranked) {
    career.set(row.runnerId, (career.get(row.runnerId) ?? 0) + 1);
    if (row.runnerName) runnerName.set(row.runnerId, row.runnerName);
    const club = resolver.resolve(row.clubId, row.year, row.clubName);
    if (!club) continue;
    const agg = byClub.get(club.mainId) ?? {
      starts: 0,
      years: new Set<number>(),
      yearSize: new Map<number, number>(),
      winsM: 0,
      winsF: 0,
      podiumsM: 0,
      podiumsF: 0,
    };
    agg.starts += 1;
    agg.years.add(row.year);
    agg.yearSize.set(row.year, (agg.yearSize.get(row.year) ?? 0) + 1);
    const rank = catRank.get(row) ?? 0;
    const sex = runnerSex(row.runnerId);
    if (rank === 1) {
      if (sex === "M") agg.winsM += 1;
      else agg.winsF += 1;
    }
    if (rank >= 1 && rank <= 3) {
      if (sex === "M") agg.podiumsM += 1;
      else agg.podiumsF += 1;
    }
    byClub.set(club.mainId, agg);
    const perClub = runnerClub.get(row.runnerId) ?? new Map<string, number>();
    perClub.set(club.mainId, (perClub.get(club.mainId) ?? 0) + 1);
    runnerClub.set(row.runnerId, perClub);
  }

  const ref = (id: string): ClubRef => ({
    id,
    slug: resolver.slug(id),
    name: resolver.profileName(id) || id,
  });

  const streaks: StreakRow[] = [];
  const loyal: LoyalRow[] = [];
  const expeditionMax: ExpeditionRow[] = [];
  const expeditions: ExpeditionRow[] = [];
  const medals: MedalRow[] = [];
  const efficiency: EfficiencyRow[] = [];

  for (const [id, agg] of byClub) {
    const yearsList = [...agg.years];
    const streak = longestStreak(yearsList);
    const first = Math.min(...yearsList);
    const last = Math.max(...yearsList);
    const missed = last - first + 1 - yearsList.length;
    const base = { ...ref(id), starts: agg.starts, editions: yearsList.length };
    streaks.push({ ...base, length: streak.length, from: streak.from, to: streak.to });
    loyal.push({ ...base, firstYear: first, lastYear: last, streak: streak.length, missed });
    const [maxYear, maxSize] = [...agg.yearSize.entries()].sort(
      (a, b) => b[1] - a[1] || b[0] - a[0],
    )[0]!;
    expeditionMax.push({ ...ref(id), year: maxYear, size: maxSize });
    for (const [year, size] of agg.yearSize) {
      expeditions.push({ ...ref(id), year, size });
    }
    medals.push({
      ...base,
      wins: agg.winsM + agg.winsF,
      podiums: agg.podiumsM + agg.podiumsF,
      winsM: agg.winsM,
      winsF: agg.winsF,
      podiumsM: agg.podiumsM,
      podiumsF: agg.podiumsF,
    });
    if (agg.starts >= minEff) {
      efficiency.push({
        ...base,
        wins: agg.winsM + agg.winsF,
        podiums: agg.podiumsM + agg.podiumsF,
      });
    }
  }

  streaks.sort(
    (a, b) => b.length - a.length || b.starts - a.starts || a.name.localeCompare(b.name, "cs"),
  );
  loyal.sort(
    (a, b) => b.editions - a.editions || b.starts - a.starts || a.name.localeCompare(b.name, "cs"),
  );
  expeditions.sort(
    (a, b) => b.size - a.size || b.year - a.year || a.name.localeCompare(b.name, "cs"),
  );
  expeditionMax.sort(
    (a, b) => b.size - a.size || b.year - a.year || a.name.localeCompare(b.name, "cs"),
  );
  medals.sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || byStartsThenName(a, b));
  efficiency.sort(
    (a, b) =>
      b.wins / b.starts - a.wins / a.starts ||
      b.podiums / b.starts - a.podiums / a.starts ||
      byStartsThenName(a, b),
  );

  const newcomers: NewcomerRow[] = loyal
    .filter((row) => row.firstYear === lastYear)
    .map((row) => ({ ...ref(row.id), firstYear: row.firstYear, starts: row.starts }))
    .sort(byStartsThenName);
  const newcomersByYear = new Map<number, number>();
  for (const row of loyal)
    newcomersByYear.set(row.firstYear, (newcomersByYear.get(row.firstYear) ?? 0) + 1);

  const returns: ReturnRow[] = [];
  for (const [id, agg] of byClub) {
    if (!agg.years.has(lastYear) || agg.years.has(lastYear - 1)) continue;
    const earlier = [...agg.years].filter((year) => year < lastYear);
    if (earlier.length === 0) continue;
    const lastBefore = Math.max(...earlier);
    returns.push({
      ...ref(id),
      year: lastYear,
      lastBefore,
      gap: lastYear - lastBefore - 1,
      starts: agg.yearSize.get(lastYear) ?? 0,
    });
  }
  returns.sort((a, b) => b.gap - a.gap || a.name.localeCompare(b.name, "cs"));

  const vets = [...career.entries()].filter(([, starts]) => starts >= threshold).map(([id]) => id);
  const veteransMap = new Map<string, VeteranClubRow>();
  for (const runnerId of vets) {
    const clubs = runnerClub.get(runnerId);
    if (!clubs || clubs.size === 0) continue;
    const max = Math.max(...clubs.values());
    for (const [clubId, clubStarts] of clubs) {
      if (clubStarts !== max) continue;
      const row =
        veteransMap.get(clubId) ??
        ({ ...ref(clubId), count: 0, examples: [] } satisfies VeteranClubRow);
      row.count += 1;
      row.examples.push({
        runnerId,
        name: runnerName.get(runnerId) || runnerId,
        career: career.get(runnerId) ?? 0,
        clubStarts,
      });
      veteransMap.set(clubId, row);
    }
  }
  const veterans = [...veteransMap.values()]
    .map((row) => ({
      ...row,
      examples: [...row.examples].sort((a, b) => b.career - a.career).slice(0, 3),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "cs"));

  const nextYear = lastYear + 1;
  const jubilees: JubileeGroup[] = JUBILEE_NTH.map((nth) => ({
    nth,
    clubs: loyal
      .filter((row) => row.editions + 1 === nth)
      .sort((a, b) => a.name.localeCompare(b.name, "cs")),
  })).filter((group) => group.clubs.length > 0);

  const clubsPerYear = years.map((year) => {
    const ids = new Set<string>();
    for (const [id, agg] of byClub) if (agg.years.has(year)) ids.add(id);
    return { year, clubs: ids.size };
  });

  return {
    finishers: rows.length,
    unlinkedStarts,
    clubs: byClub.size,
    firstYear,
    lastYear,
    editions,
    veteranThreshold: threshold,
    veteranCount: vets.length,
    nextYear,
    streaks,
    loyal,
    expeditions,
    expeditionMax,
    newcomers,
    newcomersLatestYear: lastYear,
    newcomersLatestCount: newcomersByYear.get(lastYear) ?? 0,
    returns,
    medals,
    efficiency,
    veterans,
    jubilees,
    clubsPerYear,
  };
}

export function isClubListQuery(query: { q?: string; razeni?: string; strana?: string }): boolean {
  return Boolean(query.q?.trim() || query.razeni || query.strana);
}
