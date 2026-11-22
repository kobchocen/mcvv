import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { BibRange } from "@/lib/race/start-settings";
import type { GeneratorEntry, GeneratorInput } from "@/lib/race/startlist-generator";
import { DEFAULT_START_MODEL } from "@/lib/race/start-time";

import { consistencyChecks } from "./checks-core";
import {
  configFromForm,
  DEFAULT_TEST_MODE_CONFIG,
  dueAutoStart,
  testPhase,
  isShadowYear,
  parseTestModeConfig,
  parseTimes,
  planTestRun,
  serializeTestModeConfig,
  testDayBlocked,
  TEST_SHADOW_YEAR,
} from "./config-core";
import { nextFreeTestBib } from "./onsite-core";
import { isPublicYear, PUBLIC_YEAR_WHERE, publicYears } from "./public-year";
import {
  buildTestRoster,
  isFictionalId,
  makeFictionalEntries,
  testGeneratorInput,
} from "./roster-core";

describe("testmode config", () => {
  it("shadow year is never a real edition", () => {
    assert.equal(isShadowYear(TEST_SHADOW_YEAR), true);
    assert.equal(isShadowYear(2026), false);
  });

  it("falls back to defaults for missing or broken settings", () => {
    assert.deepEqual(parseTestModeConfig(null), DEFAULT_TEST_MODE_CONFIG);
    assert.deepEqual(parseTestModeConfig("{not json"), DEFAULT_TEST_MODE_CONFIG);
    const c = parseTestModeConfig({ fictionalRunners: 999, times: "nope", durationH: 0 });
    assert.equal(c.fictionalRunners, 30);
    assert.deepEqual(c.times, ["10:15", "20:15"]);
    assert.equal(c.durationH, 3);
  });

  it("round-trips and keeps cleanup after the end", () => {
    const c = parseTestModeConfig({ ...DEFAULT_TEST_MODE_CONFIG, durationH: 4, cleanupAfterH: 2 });
    assert.equal(c.cleanupAfterH, 5);
    assert.deepEqual(parseTestModeConfig(serializeTestModeConfig(c)), c);
  });

  it("parses times: valid, unique, sorted", () => {
    assert.deepEqual(parseTimes("20:15, 10:15;10:15 25:00"), ["10:15", "20:15"]);
    assert.equal(parseTimes(""), null);
  });

  it("form rejects invalid input with a field error", () => {
    const form = (over: Record<string, string>) => {
      const base: Record<string, string> = {
        fictionalRunners: "10",
        copyLiveFrom: "12-03",
        times: "10:15, 20:15",
        durationH: "3",
        cleanupAfterH: "5",
        blockBeforeRace: "on",
        ...over,
      };
      return configFromForm((n) => base[n] ?? null);
    };
    const ok = form({});
    assert.ok(ok.ok);
    if (ok.ok) assert.equal(ok.config.blockBeforeRace, true);
    assert.deepEqual(form({ fictionalRunners: "301" }), { ok: false, error: "fictionalRunners" });
    assert.deepEqual(form({ copyLiveFrom: "3.12." }), { ok: false, error: "copyLiveFrom" });
    assert.deepEqual(form({ times: "10:15, 9:5" }), { ok: false, error: "times" });
    assert.deepEqual(form({ durationH: "7" }), { ok: false, error: "durationH" });
    assert.deepEqual(form({ cleanupAfterH: "2" }), { ok: false, error: "cleanupAfterH" });
    const off = form({ blockBeforeRace: "" });
    assert.ok(off.ok && off.config.blockBeforeRace === false);
  });
});

describe("testmode plan", () => {
  const race = new Date(Date.UTC(2026, 11, 6));
  const config = DEFAULT_TEST_MODE_CONFIG;

  it("blocks race day and (optionally) two days before", () => {
    assert.equal(testDayBlocked(new Date("2026-12-06T09:00:00Z"), race, config), true);
    assert.equal(testDayBlocked(new Date("2026-12-04T09:15:00Z"), race, config), true);
    assert.equal(testDayBlocked(new Date("2026-12-03T19:15:00Z"), race, config), false);
    assert.equal(
      testDayBlocked(new Date("2026-12-04T09:15:00Z"), race, { ...config, blockBeforeRace: false }),
      false,
    );
    // 23:30 UTC 3. 12. je v Praze už 4. 12.
    assert.equal(testDayBlocked(new Date("2026-12-03T23:30:00Z"), race, config), true);
  });

  it("copies the live start list only from copyLiveFrom and when drawn", () => {
    const at = new Date("2026-12-03T09:15:00Z");
    const p = planTestRun({ at, raceDate: race, config, liveStartListDrawn: true });
    assert.equal(p.roster, "copy");
    assert.equal(p.zero.getTime() - at.getTime(), 3_600_000);
    assert.equal(p.endAt.getTime() - at.getTime(), 3 * 3_600_000);
    assert.equal(p.cleanupAt.getTime() - at.getTime(), 5 * 3_600_000);
    assert.equal(
      planTestRun({ at, raceDate: race, config, liveStartListDrawn: false }).roster,
      "draw",
    );
    const early = new Date("2026-11-29T09:15:00Z");
    assert.equal(
      planTestRun({ at: early, raceDate: race, config, liveStartListDrawn: true }).roster,
      "draw",
    );
  });
});

const RANGES: BibRange[] = [
  { categoryId: "A", bibFrom: 301, bibTo: 380 },
  { categoryId: "K", bibFrom: 641, bibTo: 680 },
];

function entry(id: string, categoryId: string, over: Partial<GeneratorEntry> = {}): GeneratorEntry {
  return {
    runnerId: id,
    name: `Běžec ${id}`,
    categoryId,
    currentBib: null,
    locked: false,
    eligible: true,
    lastYearTime: null,
    ...over,
  };
}

function base(entries: GeneratorEntry[]): GeneratorInput {
  return {
    model: DEFAULT_START_MODEL,
    ranges: RANGES,
    categorySort: { A: 1, K: 2 },
    champions: [],
    entries,
  };
}

describe("testmode roster", () => {
  it("fictional runners are spread over categories and marked", () => {
    const f = makeFictionalEntries(5, ["A", "K"]);
    assert.equal(f.length, 5);
    assert.deepEqual(
      f.map((e) => e.categoryId),
      ["A", "K", "A", "K", "A"],
    );
    assert.ok(f.every((e) => isFictionalId(e.runnerId) && e.name.startsWith("TEST")));
    assert.deepEqual(makeFictionalEntries(3, []), []);
  });

  it("generator input drops unpaid entries and live bibs/locks", () => {
    const input = testGeneratorInput(
      base([
        entry("R0000001", "A", { currentBib: 305, locked: true }),
        entry("R0000002", "A", { eligible: false }),
      ]),
      [],
    );
    assert.equal(input.entries.length, 1);
    assert.equal(input.entries[0].currentBib, null);
    assert.equal(input.entries[0].locked, false);
  });

  it("draws a start list with live and fictional runners without touching live bibs", () => {
    const live = [entry("R0000001", "A", { currentBib: 377 }), entry("R0000002", "K")];
    const result = buildTestRoster({
      base: base(live),
      clubOf: new Map([["R0000001", "OK Choceň"]]),
      fictional: 4,
      source: "draw",
    });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.source, "draw");
    assert.equal(result.rows.length, 6);
    assert.equal(result.rows.filter((r) => r.fictional).length, 4);
    assert.ok(result.rows.filter((r) => r.fictional).every((r) => r.runnerId === null));
    assert.equal(result.rows.find((r) => r.runnerId === "R0000001")?.club, "OK Choceň");
    assert.equal(new Set(result.rows.map((r) => r.bib)).size, 6);
    assert.equal(live[0].currentBib, 377);
  });

  it("copy keeps live bibs of paid entries", () => {
    const result = buildTestRoster({
      base: base([
        entry("R0000001", "A", { currentBib: 302 }),
        entry("R0000002", "K", { currentBib: 641 }),
        entry("R0000003", "K", { currentBib: 650, eligible: false }),
      ]),
      clubOf: new Map(),
      fictional: 10,
      source: "copy",
    });
    assert.ok(result.ok);
    if (result.ok)
      assert.deepEqual(
        result.rows.map((r) => r.bib),
        [302, 641],
      );
  });

  it("reports an empty roster", () => {
    assert.deepEqual(
      buildTestRoster({ base: base([]), clubOf: new Map(), fictional: 0, source: "draw" }),
      { ok: false, error: "empty" },
    );
  });
});

describe("testmode consistency checks", () => {
  it("passes a clean run", () => {
    const r = consistencyChecks({
      rosterBibs: [1, 2],
      startedBibs: [1, 2],
      splits: [
        { bib: 1, split: "1", time: 300 },
        { bib: 1, split: "C", time: 900 },
        { bib: 2, split: "1", time: 320 },
        { bib: 2, split: "C", time: 950 },
      ],
      order: ["1"],
      finish: "C",
      ended: true,
    });
    assert.equal(r.ok, true);
    assert.equal(r.finished, 2);
  });

  it("finds every kind of problem", () => {
    const r = consistencyChecks({
      rosterBibs: [1, 2, 3, 3, 4],
      startedBibs: [1, 3, 4],
      splits: [
        { bib: 1, split: "1", time: 900 },
        { bib: 1, split: "C", time: 800 },
        { bib: 2, split: "C", time: 700 },
        { bib: 9, split: "1", time: 100 },
        { bib: 3, split: "1", time: -5 },
      ],
      order: ["1"],
      finish: "C",
      ended: true,
    });
    const kinds = r.issues.map((i) => i.kind).sort();
    assert.deepEqual(kinds, [
      "duplicate_bib",
      "finish_without_start",
      "missing_split",
      "negative_time",
      "not_increasing",
      "started_no_finish",
      "started_no_finish",
      "unknown_bib",
    ]);
    assert.equal(r.ok, false);
    assert.equal(r.roster, 4);
  });
});

describe("testmode phases and scheduler", () => {
  const race = new Date(Date.UTC(2026, 11, 6));
  const on = { ...DEFAULT_TEST_MODE_CONFIG, enabled: true };

  it("phase follows T+1h / T+3h / T+5h", () => {
    const at = new Date("2026-11-28T09:15:00Z");
    const p = planTestRun({ at, raceDate: race, config: on, liveStartListDrawn: false });
    const run = { zeroAt: p.zero, endAt: p.endAt, cleanupAt: p.cleanupAt };
    const h = (n: number) => new Date(at.getTime() + n * 3_600_000);
    assert.equal(testPhase(run, h(0.5)), "office");
    assert.equal(testPhase(run, h(1)), "race");
    assert.equal(testPhase(run, h(3)), "ended");
    assert.equal(testPhase(run, h(5)), "cleanup");
  });

  it("auto start only when enabled, in the window, once, and not on blocked days", () => {
    // 10:15 v Praze = 09:15 UTC (listopad, SEČ)
    const now = new Date("2026-11-28T09:17:30Z");
    const base = { now, raceDate: race, activeRun: false, lastStartedAt: null };
    assert.equal(dueAutoStart({ ...base, config: DEFAULT_TEST_MODE_CONFIG }), null);
    const slot = dueAutoStart({ ...base, config: on });
    assert.equal(slot?.toISOString(), "2026-11-28T09:15:00.000Z");
    assert.equal(dueAutoStart({ ...base, config: on, lastStartedAt: slot }), null);
    assert.equal(dueAutoStart({ ...base, config: on, activeRun: true }), null);
    assert.equal(
      dueAutoStart({ ...base, config: on, now: new Date("2026-11-28T09:25:00Z") }),
      null,
    );
    assert.equal(
      dueAutoStart({ ...base, config: on, now: new Date("2026-12-05T09:16:00Z") }),
      null,
    );
  });
});

describe("test on-site bib", () => {
  it("nearest free bib in the category's start line, never a champion", () => {
    const ranges = [
      { categoryId: "A", bibFrom: 399, bibTo: 401 },
      { categoryId: "K", bibFrom: 641, bibTo: 642 },
    ];
    const base = { model: DEFAULT_START_MODEL, ranges, champions: [400] };
    assert.equal(nextFreeTestBib({ ...base, categoryId: "A", taken: new Set([399]) }), 401);
    assert.equal(nextFreeTestBib({ ...base, categoryId: "K", taken: new Set([641, 642]) }), 643);
  });
});

describe("public year guard", () => {
  it("shadow years never reach public outputs", () => {
    assert.equal(isPublicYear(2026), true);
    assert.equal(isPublicYear(9026), false);
    assert.equal(isPublicYear(Number.NaN), false);
    assert.deepEqual(publicYears([9026, 2026, 2025]), [2026, 2025]);
    assert.deepEqual(PUBLIC_YEAR_WHERE, { lt: 9000 });
  });

  it("public year lists and pages use the guard", () => {
    const read = (path: string) =>
      readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
    assert.match(read("src/lib/results/cached.ts"), /PUBLIC_YEAR_WHERE/);
    assert.match(read("src/lib/raceday/tombola.ts"), /PUBLIC_YEAR_WHERE[\s\S]*PUBLIC_YEAR_WHERE/);
    assert.match(read("src/app/[locale]/results/[year]/page.tsx"), /isPublicYear\(year\)/);
    assert.match(read("src/app/[locale]/results/page.tsx"), /publicYears\(/);
    // Veřejné živé výstupy berou ostrý kontext, nikdy testovací.
    for (const path of ["src/lib/live/online-results.ts", "src/lib/live/speaker.ts"]) {
      assert.doesNotMatch(read(path), /getLiveRaceContext/, path);
    }
  });
});
