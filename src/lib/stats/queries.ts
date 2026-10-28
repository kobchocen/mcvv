import { getClubResolver } from "@/lib/clubs/queries";
import { prisma } from "@/lib/db/client";
import { runnerNameFor } from "@/lib/format/runner-name";
import { formatRaceTime } from "@/lib/utils";

import { personalRecordsByYear, runnerBirthYear, runnerSex, type RawResult } from "./core";
import { recordEvolution } from "./records-core";
import { computeNationalityStats, type NationalityStats } from "@/lib/runner/nationality";
import { loadNationalityMap } from "@/lib/runner/nationality-query";

export * from "./core";

export async function loadAllResults(): Promise<RawResult[]> {
  const rows = await prisma.result.findMany({
    select: {
      year: true,
      time: true,
      runnerId: true,
      runnerName: true,
      clubId: true,
      clubName: true,
      club: { select: { name: true } },
      runner: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    year: row.year,
    time: row.time,
    runnerId: row.runnerId,
    runnerName: runnerNameFor("stats", row.runnerName, row.runner?.name),
    clubId: row.clubId,
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
    /** Club profile slug (#196); null = no club. */
    clubSlug: string | null;
    time: string;
    runnerId: string;
  }[];
};

export async function getRecordEvolution(): Promise<RecordEvolutionGroup[]> {
  const [categories, results, clubs] = await Promise.all([
    prisma.category.findMany({ orderBy: { sort: "asc" } }),
    loadAllResults(),
    getClubResolver(),
  ]);
  const groups: RecordEvolutionGroup[] = [];

  for (const category of categories) {
    // Stejné pravidlo jako uložený rekord kategorie (records-core, #129).
    const rows = recordEvolution(category, results).map((winner) => ({
      year: winner.year,
      name: winner.runnerName || "—",
      birthYear: String(runnerBirthYear(winner.runnerId)),
      club: clubs.display(winner.clubId, winner.year, winner.clubName),
      clubSlug: clubs.resolve(winner.clubId, winner.year, winner.clubName)?.slug ?? null,
      time: formatRaceTime(winner.time),
      runnerId: winner.runnerId,
    }));
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
  /** Club profile slug (#196); null = no club. */
  clubSlug: string | null;
  time: string;
  runnerId: string;
};

export async function getTopTimesBySex(
  limit = 20,
): Promise<{ men: TopTimeRow[]; women: TopTimeRow[] }> {
  const [results, clubs] = await Promise.all([loadAllResults(), getClubResolver()]);
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
        club: clubs.display(row.clubId, row.year, row.clubName),
        clubSlug: clubs.resolve(row.clubId, row.year, row.clubName)?.slug ?? null,
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
  for (const row of results) {
    const first = firstYear.get(row.runnerId);
    if (first === undefined || row.year < first) {
      firstYear.set(row.runnerId, row.year);
    }
  }
  const prs = personalRecordsByYear(results);

  return years.map((year) => {
    const inYear = results.filter((row) => row.year === year);
    const personalRecords = prs.get(year)?.length ?? 0;
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

/** Statistika států (#200): podle uvedené státní příslušnosti běžců s výsledkem. */
export async function getNationalityStats(): Promise<
  NationalityStats & { names: Map<string, string> }
> {
  const [results, nationalities] = await Promise.all([loadAllResults(), loadNationalityMap()]);
  const names = new Map<string, string>();
  for (const row of results) {
    if (row.runnerName) {
      names.set(row.runnerId, row.runnerName);
    }
  }
  return { ...computeNationalityStats(results, nationalities), names };
}
