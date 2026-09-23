import { prisma } from "@/lib/db/client";
import { formatRaceTime } from "@/lib/utils";

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
  clubName: string | null;
};

export function runnerSex(id: string): "M" | "F" {
  return id.charAt(4) < "5" ? "M" : "F";
}

export function runnerBirthYear(id: string): number {
  return Number(id.slice(0, 4));
}

export function isEligible(
  runnerId: string,
  raceYear: number,
  category: { sex: string; age: number },
): boolean {
  if (runnerSex(runnerId) !== category.sex) {
    return false;
  }
  const born = runnerBirthYear(runnerId);
  if (!Number.isFinite(born) || born < 1920 || born > raceYear) {
    return false;
  }
  if (category.age === 0) {
    return true;
  }
  const cutoff = raceYear - category.age;
  if (category.age <= 20) {
    return born >= cutoff;
  }
  return born <= cutoff;
}

async function loadAllResults(): Promise<RawResult[]> {
  const rows = await prisma.result.findMany({
    select: {
      year: true,
      time: true,
      runnerId: true,
      runnerName: true,
      clubName: true,
      club: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    year: row.year,
    time: row.time,
    runnerId: row.runnerId,
    runnerName: row.runnerName,
    clubName: row.club?.name || row.clubName || null,
  }));
}

export type RecordEvolutionGroup = {
  category: string;
  rows: {
    year: number;
    name: string;
    birthYear: string;
    club: string;
    time: string;
    runnerId: string;
  }[];
};

export async function getRecordEvolution(): Promise<RecordEvolutionGroup[]> {
  const [categories, results] = await Promise.all([
    prisma.category.findMany({ orderBy: { sort: "asc" } }),
    loadAllResults(),
  ]);
  const years = [...new Set(results.map((row) => row.year))].sort((a, b) => a - b);
  const groups: RecordEvolutionGroup[] = [];

  for (const category of categories) {
    let best = Number.POSITIVE_INFINITY;
    const rows: RecordEvolutionGroup["rows"] = [];
    for (const year of years) {
      const eligible = results.filter(
        (row) => row.year === year && isEligible(row.runnerId, year, category),
      );
      if (eligible.length === 0) {
        continue;
      }
      const winner = eligible.reduce((a, b) => (a.time <= b.time ? a : b));
      if (winner.time < best) {
        best = winner.time;
        rows.push({
          year,
          name: winner.runnerName || "—",
          birthYear: String(runnerBirthYear(winner.runnerId)),
          club: winner.clubName || "—",
          time: formatRaceTime(winner.time),
          runnerId: winner.runnerId,
        });
      }
    }
    if (rows.length > 0) {
      groups.push({ category: category.name, rows });
    }
  }

  return groups;
}

export type WinnerYearRow = {
  year: number;
  menName: string;
  menTime: string;
  menId?: string;
  womenName: string;
  womenTime: string;
  womenId?: string;
};

export async function getAbsoluteWinners(): Promise<WinnerYearRow[]> {
  const results = await loadAllResults();
  const years = [...new Set(results.map((row) => row.year))].sort((a, b) => b - a);
  return years.map((year) => {
    const inYear = results.filter((row) => row.year === year);
    const men = inYear.filter((row) => runnerSex(row.runnerId) === "M");
    const women = inYear.filter((row) => runnerSex(row.runnerId) === "F");
    const bestMen = men.length ? men.reduce((a, b) => (a.time <= b.time ? a : b)) : null;
    const bestWomen = women.length ? women.reduce((a, b) => (a.time <= b.time ? a : b)) : null;
    return {
      year,
      menName: bestMen?.runnerName || "—",
      menTime: bestMen ? formatRaceTime(bestMen.time) : "—",
      menId: bestMen?.runnerId,
      womenName: bestWomen?.runnerName || "—",
      womenTime: bestWomen ? formatRaceTime(bestWomen.time) : "—",
      womenId: bestWomen?.runnerId,
    };
  });
}

export type TopTimeRow = {
  rank: number;
  year: number;
  name: string;
  birthYear: string;
  club: string;
  time: string;
  runnerId: string;
};

export async function getTopTimesBySex(
  limit = 20,
): Promise<{ men: TopTimeRow[]; women: TopTimeRow[] }> {
  const results = await loadAllResults();
  const toRows = (sex: "M" | "F"): TopTimeRow[] =>
    results
      .filter((row) => runnerSex(row.runnerId) === sex)
      .sort((a, b) => a.time - b.time)
      .slice(0, limit)
      .map((row, index) => ({
        rank: index + 1,
        year: row.year,
        name: row.runnerName || "—",
        birthYear: String(runnerBirthYear(row.runnerId)),
        club: row.clubName || "—",
        time: formatRaceTime(row.time),
        runnerId: row.runnerId,
      }));
  return { men: toRows("M"), women: toRows("F") };
}

export type AgeRecordRow = {
  age: number;
  menYear?: number;
  menName?: string;
  menTime?: string;
  menId?: string;
  womenYear?: number;
  womenName?: string;
  womenTime?: string;
  womenId?: string;
};

export async function getAgeRecords(): Promise<AgeRecordRow[]> {
  const results = await loadAllResults();
  const best = new Map<string, RawResult & { age: number }>();
  for (const row of results) {
    const born = runnerBirthYear(row.runnerId);
    if (!Number.isFinite(born) || born < 1920 || born > row.year) {
      continue;
    }
    const age = row.year - born;
    const key = `${age}-${runnerSex(row.runnerId)}`;
    const current = best.get(key);
    if (!current || row.time < current.time) {
      best.set(key, { ...row, age });
    }
  }
  const byAge = new Map<number, AgeRecordRow>();
  for (const row of best.values()) {
    const entry = byAge.get(row.age) ?? { age: row.age };
    if (runnerSex(row.runnerId) === "M") {
      entry.menYear = row.year;
      entry.menName = row.runnerName || "—";
      entry.menTime = formatRaceTime(row.time);
      entry.menId = row.runnerId;
    } else {
      entry.womenYear = row.year;
      entry.womenName = row.runnerName || "—";
      entry.womenTime = formatRaceTime(row.time);
      entry.womenId = row.runnerId;
    }
    byAge.set(row.age, entry);
  }
  return [...byAge.values()].sort((a, b) => a.age - b.age);
}

export type VeteranRow = {
  rank: number;
  name: string;
  birthYear: string;
  starts: number;
  record: string;
  average: string;
  runnerId: string;
};

export async function getVeteranClub(): Promise<{ men: VeteranRow[]; women: VeteranRow[] }> {
  const results = await loadAllResults();
  const yearCount = new Set(results.map((row) => row.year)).size;
  const pocr = Math.round(yearCount / 2 + 0.5) - 1;

  const byRunner = new Map<string, RawResult[]>();
  for (const row of results) {
    const list = byRunner.get(row.runnerId) ?? [];
    list.push(row);
    byRunner.set(row.runnerId, list);
  }

  const toRows = (sex: "M" | "F"): VeteranRow[] => {
    const members = [...byRunner.entries()]
      .filter(([id, rows]) => runnerSex(id) === sex && rows.length > pocr)
      .map(([id, rows]) => {
        const times = rows.map((row) => row.time);
        const record = Math.min(...times);
        const average = times.reduce((sum, time) => sum + time, 0) / times.length;
        const sample = rows[0];
        return {
          runnerId: id,
          name: sample.runnerName || "—",
          birthYear: String(runnerBirthYear(id)),
          starts: rows.length,
          record,
          average,
        };
      })
      .sort((a, b) => b.starts - a.starts || a.average - b.average || a.record - b.record);

    return members.map((row, index) => ({
      rank: index + 1,
      name: row.name,
      birthYear: row.birthYear,
      starts: row.starts,
      record: formatRaceTime(row.record),
      average: formatRaceTime(Math.round(row.average)),
      runnerId: row.runnerId,
    }));
  };

  return { men: toRows("M"), women: toRows("F") };
}

export type AttendanceRow = {
  year: number;
  count: number;
  newcomers: number;
  personalRecords: number;
  best: string;
  average: string;
  men: number;
  women: number;
};

export async function getAttendance(): Promise<AttendanceRow[]> {
  const results = await loadAllResults();
  const years = [...new Set(results.map((row) => row.year))].sort((a, b) => a - b);
  const firstYear = new Map<string, number>();
  const bestSoFar = new Map<string, number>();
  for (const row of results) {
    const first = firstYear.get(row.runnerId);
    if (first === undefined || row.year < first) {
      firstYear.set(row.runnerId, row.year);
    }
  }

  return years.map((year) => {
    const inYear = results.filter((row) => row.year === year);
    let personalRecords = 0;
    for (const row of inYear) {
      const previous = bestSoFar.get(row.runnerId);
      if (previous === undefined || row.time < previous) {
        personalRecords += 1;
        bestSoFar.set(row.runnerId, row.time);
      }
    }
    const times = inYear.map((row) => row.time);
    const men = inYear.filter((row) => runnerSex(row.runnerId) === "M").length;
    const women = inYear.filter((row) => runnerSex(row.runnerId) === "F").length;
    return {
      year,
      count: inYear.length,
      newcomers: inYear.filter((row) => firstYear.get(row.runnerId) === year).length,
      personalRecords,
      best: times.length ? formatRaceTime(Math.min(...times)) : "—",
      average: times.length
        ? formatRaceTime(Math.round(times.reduce((sum, time) => sum + time, 0) / times.length))
        : "—",
      men,
      women,
    };
  });
}
