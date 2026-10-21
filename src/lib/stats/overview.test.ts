import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClubResolver } from "@/lib/clubs/core";

import type { RawResult } from "./core";
import { computeStatsOverview, normalizeClubName, rankRows } from "./overview";

// ids: YYYY + sex digit (0–4 men, 5–9 women) + sequence
const r = (
  year: number,
  runnerId: string,
  time: number,
  runnerName: string,
  clubName: string | null = null,
): RawResult => ({ year, runnerId, time, runnerName, clubName });

const RESULTS: RawResult[] = [
  // 2001: men 900 / 905 (gap 5), women 1100 / 1160 (gap 60)
  r(2001, "19800001", 900, "Rychlý Petr", "K.O.B. Choceň"),
  r(2001, "19810001", 905, "Druhý Jan", "KOB Choceň"),
  r(2001, "19855001", 1100, "Svižná Eva", "OK Lokomotiva Pardubice"),
  r(2001, "19865001", 1160, "Pomalá Ivana", ""),
  // 2002: men 880 / 1000 (gap 120), women 1090 / 1091 (gap 1); Druhý improves 905 → 880
  r(2002, "19810001", 880, "Druhý Jan", "kob chocen"),
  r(2002, "19800001", 1000, "Rychlý Petr", "K.O.B. Choceň"),
  r(2002, "19855001", 1090, "Svižná Eva", "OK Lokomotiva Pardubice"),
  r(2002, "19865001", 1091, "Pomalá Ivana", null),
  r(2002, "19305001", 2000, "Stará Marie", null), // age 72 (oldest)
  r(2002, "19990001", 1500, "Malý Tom", null), // age 3 → implausible, ignored
  r(2002, "19940001", 1400, "Mladý Ondra", "K.O.B. Choceň"), // age 8 → youngest
  // 2003: one runner
  r(2003, "19855001", 1080, "Svižná Eva", "OK Lokomotiva Pardubice"),
];

describe("computeStatsOverview", () => {
  const o = computeStatsOverview(
    RESULTS,
    [
      { runnerId: "19855001", name: "Svižná Eva", count: 10 },
      { runnerId: "19800001", name: "Rychlý Petr", count: 10 },
      { runnerId: "19810001", name: "Druhý Jan", count: 4 },
    ],
    1234,
  );

  it("hero counters: editions, starts, distinct runners, km = starts × 4.3", () => {
    assert.equal(o.firstYear, 2001);
    assert.equal(o.lastYear, 2003);
    assert.equal(o.editions, 3);
    assert.equal(o.starts, 12);
    assert.equal(o.runners, 7);
    assert.equal(o.km, Math.round(12 * 4.3));
  });

  it("course records per sex", () => {
    assert.deepEqual(o.courseRecords.M, {
      runnerId: "19810001",
      name: "Druhý Jan",
      year: 2002,
      time: 880,
    });
    assert.equal(o.courseRecords.F?.time, 1080);
    assert.equal(o.courseRecords.F?.year, 2003);
  });

  it("most wins per sex with year range", () => {
    assert.equal(o.mostWins.F?.count, 3);
    assert.deepEqual(o.mostWins.F?.runners, [
      { runnerId: "19855001", name: "Svižná Eva", firstYear: 2001, lastYear: 2003 },
    ]);
    // men: Rychlý 2001, Druhý 2002 → tie with 1 win each
    assert.equal(o.mostWins.M?.count, 1);
    assert.deepEqual(
      o.mostWins.M?.runners.map((runner) => runner.runnerId),
      ["19800001", "19810001"],
    );
  });

  it("closest finish and largest margin between 1st and 2nd", () => {
    assert.equal(o.closestFinish.M?.gap, 5);
    assert.equal(o.closestFinish.M?.year, 2001);
    assert.equal(o.closestFinish.F?.gap, 1);
    assert.equal(o.closestFinish.F?.second.name, "Pomalá Ivana");
    assert.equal(o.largestMargin.M?.gap, 120);
    assert.equal(o.largestMargin.M?.year, 2002);
    assert.equal(o.largestMargin.F?.gap, 60);
  });

  it("year with most personal records and the biggest improvement", () => {
    // 2001: 4 first starts; 2002: Druhý (905→880), Svižná (1100→1090), Pomalá (1160→1091)
    // + 3 first starts = 6
    assert.equal(o.personalRecords?.year, 2002);
    assert.equal(o.personalRecords?.count, 6);
    assert.deepEqual(o.personalRecords?.best, {
      runnerId: "19865001",
      name: "Pomalá Ivana",
      year: 2002,
      time: 1091,
      previous: 1160,
      improvement: 69,
    });
  });

  it("oldest and youngest finisher ignore implausible ages (< 6)", () => {
    assert.equal(o.ageExtremes.oldest?.age, 72);
    assert.equal(o.ageExtremes.oldest?.name, "Stará Marie");
    assert.equal(o.ageExtremes.youngest?.age, 8);
    assert.equal(o.ageExtremes.youngest?.name, "Mladý Ondra");
  });

  it("record edition with bars for all years", () => {
    assert.equal(o.recordEdition?.year, 2002);
    assert.equal(o.recordEdition?.count, 7);
    assert.equal(o.recordEdition?.newcomers, 3);
    assert.equal(o.recordEdition?.personalRecords, 6);
    assert.deepEqual(o.recordEdition?.bars, [
      { year: 2001, count: 4 },
      { year: 2002, count: 7 },
      { year: 2003, count: 1 },
    ]);
  });

  it("women share overall and per year", () => {
    assert.equal(o.women.share, 6 / 12);
    assert.deepEqual(
      o.women.trend.map((p) => [p.year, p.share]),
      [
        [2001, 0.5],
        [2002, 3 / 7],
        [2003, 1],
      ],
    );
    assert.deepEqual(o.women.peak, { year: 2003, share: 1 });
  });

  it("groups clubs by written name, case/diacritics/punctuation ignored (#104)", () => {
    assert.deepEqual(o.clubs, [
      { name: "K.O.B. Choceň", slug: "k-o-b-chocen", starts: 5 },
      { name: "OK Lokomotiva Pardubice", slug: "ok-lokomotiva-pardubice", starts: 3 },
    ]);
  });

  it("uses the canonical club once names are merged in the admin (#104)", () => {
    const club = { id: 2, slug: "lokomotiva-pardubice", name: "OK Lokomotiva Pardubice" };
    const merged = computeStatsOverview(
      [
        ...RESULTS,
        r(2003, "19700001", 1500, "Loko Pavel", "Loko OB Pardubice"),
        r(2003, "19700002", 1500, "Loko Petr", "Loko OB Pardubice"),
        r(2003, "19700003", 1500, "Loko Jan", "Loko OB Pardubice"),
      ],
      [],
      0,
      createClubResolver([
        { key: "oklokomotivapardubice", club },
        { key: "lokoobpardubice", club },
      ]),
    );
    assert.deepEqual(merged.clubs[0], {
      name: "OK Lokomotiva Pardubice",
      slug: club.slug,
      starts: 6, // 3 × OK Lokomotiva + 3 × Loko OB
    });
    // Not merged: the unmapped "Loko OB Pardubice" would be its own club.
    const unmerged = computeStatsOverview([
      ...RESULTS,
      r(2003, "19700001", 1500, "Loko Pavel", "Loko OB Pardubice"),
    ]);
    assert.ok(unmerged.clubs.some((row) => row.name === "Loko OB Pardubice" && row.starts === 1));
  });

  it("time together on the course and total climb (starts × 200 m)", () => {
    const seconds = RESULTS.reduce((sum, row) => sum + row.time, 0);
    assert.equal(o.together.seconds, seconds);
    assert.equal(o.together.hours, Math.round(seconds / 3600));
    assert.equal(o.together.climbKm, Math.round((12 * 200) / 1000));
  });

  it("photo leaders are ranked with ties", () => {
    assert.deepEqual(
      o.photos.leaders.map((row) => [row.rank, row.name, row.value]),
      [
        [1, "Svižná Eva", 10],
        [1, "Rychlý Petr", 10],
        [3, "Druhý Jan", 4],
      ],
    );
    assert.equal(o.photos.total, 1234);
  });

  it("every runner shown has an id to link to /bezec/[id] (clubs are not runners)", () => {
    const missing: string[] = [];
    let named = 0;
    const walk = (value: unknown, path: string) => {
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`));
        return;
      }
      if (!value || typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      if (typeof record.name === "string" && !path.startsWith("clubs")) {
        named += 1;
        if (typeof record.runnerId !== "string" || !/^\d{8}$/.test(record.runnerId)) {
          missing.push(path);
        }
      }
      for (const [key, child] of Object.entries(record)) {
        walk(child, path ? `${path}.${key}` : key);
      }
    };
    walk(o, "");
    assert.ok(named > 10, `expected runner names in the overview, got ${named}`);
    assert.deepEqual(missing, []);
  });

  it("handles no data", () => {
    const empty = computeStatsOverview([]);
    assert.equal(empty.editions, 0);
    assert.equal(empty.courseRecords.M, null);
    assert.equal(empty.recordEdition, null);
    assert.equal(empty.personalRecords, null);
    assert.deepEqual(empty.clubs, []);
  });
});

describe("helpers", () => {
  it("normalizeClubName ignores case, diacritics and punctuation", () => {
    assert.equal(normalizeClubName("K.O.B. Choceň"), "kobchocen");
    assert.equal(normalizeClubName(" kob  CHOCEN "), "kobchocen");
    assert.equal(normalizeClubName(null), "");
  });

  it("rankRows uses competition ranking", () => {
    assert.deepEqual(
      rankRows([{ value: 3 }, { value: 5 }, { value: 5 }, { value: 1 }]).map((row) => row.rank),
      [1, 1, 3, 4],
    );
  });
});
