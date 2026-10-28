import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dataEpoch,
  parseTestRun,
  raceDayCutoff,
  resolveTestZero,
  serializeTestRun,
  testCutoff,
  testDataWindow,
  testRunBlocked,
  testRunExpired,
  testRunExpiry,
  validateTestStart,
  type TestRun,
} from "./test-run-core";

const H = 60 * 60 * 1000;
// 2026: první neděle v prosinci = 6. 12., Europe/Prague UTC+1
const CUTOFF_2026 = new Date("2026-12-05T23:00:00.000Z");

function run(overrides: Partial<TestRun> = {}): TestRun {
  return {
    id: "abc123def0",
    startedAt: new Date("2026-11-02T08:00:00.000Z"),
    zero: new Date("2026-11-02T09:15:00.000Z"),
    expiresAt: new Date("2026-11-02T12:15:00.000Z"),
    startedBy: 7,
    tokenIds: [3],
    ...overrides,
  };
}

test("raceDayCutoff: race date 00:00 Prague, fallback first Sunday of December", () => {
  assert.equal(raceDayCutoff(null, 2026).toISOString(), CUTOFF_2026.toISOString());
  // datum ročníku je kalendářní den uložený jako UTC půlnoc
  assert.equal(
    raceDayCutoff(new Date("2026-12-06T00:00:00.000Z"), 2026).toISOString(),
    CUTOFF_2026.toISOString(),
  );
  assert.equal(
    raceDayCutoff(new Date("2026-11-29T00:00:00.000Z"), 2026).toISOString(),
    "2026-11-28T23:00:00.000Z",
  );
});

test("testCutoff falls back to the next race when the edition already took place", () => {
  const raceDate = new Date("2025-12-07T00:00:00.000Z");
  assert.equal(
    testCutoff(raceDate, 2025, new Date("2025-12-01T10:00:00.000Z")).toISOString(),
    "2025-12-06T23:00:00.000Z",
  );
  // ročník 2025 proběhl, 2026 ještě není založený → první neděle v prosinci 2026
  assert.equal(
    testCutoff(raceDate, 2025, new Date("2026-10-27T10:00:00.000Z")).toISOString(),
    CUTOFF_2026.toISOString(),
  );
  // na konci prosince už platí příští rok
  assert.equal(
    testCutoff(null, 2026, new Date("2026-12-20T10:00:00.000Z")).toISOString(),
    "2027-12-04T23:00:00.000Z",
  );
});

test("testRunBlocked from race day 00:00 (Q70)", () => {
  assert.equal(testRunBlocked(new Date(CUTOFF_2026.getTime() - 1), CUTOFF_2026), false);
  assert.equal(testRunBlocked(CUTOFF_2026, CUTOFF_2026), true);
});

test("resolveTestZero: presets, in 5 minutes and exact time", () => {
  const now = new Date("2026-11-02T08:00:30.250Z"); // 9:00:30 Prague
  assert.equal(resolveTestZero("in5", "", now)?.toISOString(), "2026-11-02T08:05:30.000Z");
  assert.equal(resolveTestZero("at1015", "", now)?.toISOString(), "2026-11-02T09:15:00.000Z");
  assert.equal(resolveTestZero("at2015", "", now)?.toISOString(), "2026-11-02T19:15:00.000Z");
  assert.equal(
    resolveTestZero("custom", "2026-11-03T18:30", now)?.toISOString(),
    "2026-11-03T17:30:00.000Z",
  );
  assert.equal(resolveTestZero("custom", "", now), null);
  assert.equal(resolveTestZero("nonsense", "2026-11-03T18:30", now), null);
  // předvolba „dnes“ podle Europe/Prague, ne UTC (23:30 UTC = 0:30 dalšího dne v Praze)
  assert.equal(
    resolveTestZero("at1015", "", new Date("2026-11-02T23:30:00.000Z"))?.toISOString(),
    "2026-11-03T09:15:00.000Z",
  );
});

test("testRunExpiry: 3 h from zero (or start), never past race day 00:00", () => {
  const startedAt = new Date("2026-11-02T08:00:00.000Z");
  assert.equal(
    testRunExpiry(startedAt, new Date("2026-11-02T09:15:00.000Z"), CUTOFF_2026).toISOString(),
    "2026-11-02T12:15:00.000Z",
  );
  // nula v minulosti → 3 h od spuštění
  assert.equal(
    testRunExpiry(startedAt, new Date("2026-11-02T07:55:00.000Z"), CUTOFF_2026).toISOString(),
    "2026-11-02T11:00:00.000Z",
  );
  // večer před závodem: konec nejpozději o půlnoci
  assert.equal(
    testRunExpiry(
      new Date("2026-12-05T20:00:00.000Z"),
      new Date("2026-12-05T20:30:00.000Z"),
      CUTOFF_2026,
    ).toISOString(),
    CUTOFF_2026.toISOString(),
  );
});

test("validateTestStart: OFeed safeguard, active test, zero bounds, race day", () => {
  const now = new Date("2026-11-02T08:00:00.000Z");
  const base = {
    now,
    zero: new Date("2026-11-02T08:05:00.000Z"),
    cutoff: CUTOFF_2026,
    active: null,
    ofeedProfile: "test" as const,
    ofeedTestEventId: "123",
  };
  assert.equal(validateTestStart(base), null);
  assert.equal(validateTestStart({ ...base, ofeedTestEventId: null }), "ofeedTestMissing");
  assert.equal(validateTestStart({ ...base, ofeedProfile: "live" }), "ofeedProfile");
  assert.equal(
    validateTestStart({ ...base, active: run({ expiresAt: new Date(now.getTime() + H) }) }),
    "active",
  );
  // vypršelý test nebrání novému
  assert.equal(validateTestStart({ ...base, active: run({ expiresAt: now }) }), null);
  assert.equal(validateTestStart({ ...base, zero: null }), "zero");
  assert.equal(
    validateTestStart({ ...base, zero: new Date(now.getTime() - 11 * 60 * 1000) }),
    "zeroPast",
  );
  assert.equal(validateTestStart({ ...base, zero: new Date(now.getTime() - 9 * 60 * 1000) }), null);
  assert.equal(validateTestStart({ ...base, zero: new Date(now.getTime() + 25 * H) }), "zeroFar");
  assert.equal(validateTestStart({ ...base, now: CUTOFF_2026, zero: CUTOFF_2026 }), "raceDay");
  assert.equal(
    validateTestStart({
      ...base,
      now: new Date("2026-12-05T20:00:00.000Z"),
      zero: new Date("2026-12-06T09:15:00.000Z"),
    }),
    "raceDay",
  );
});

test("serializeTestRun / parseTestRun round trip, garbage → null", () => {
  const original = run({ tokenIds: [5, 3, 5] });
  const parsed = parseTestRun(serializeTestRun(original));
  assert.deepEqual(parsed, { ...original, tokenIds: [3, 5] });
  for (const raw of [null, "", "{", "[]", '{"id":"x"}', '{"id":"BAD ID","startedAt":"x"}']) {
    assert.equal(parseTestRun(raw), null, String(raw));
  }
});

test("testRunExpired and testDataWindow never reach past race day", () => {
  const r = run();
  assert.equal(testRunExpired(r, new Date("2026-11-02T12:14:59.000Z")), false);
  assert.equal(testRunExpired(r, r.expiresAt), true);
  const now = new Date("2026-11-02T10:00:00.000Z");
  assert.deepEqual(testDataWindow(r, now, CUTOFF_2026), { from: r.startedAt, until: now });
  // úklid až v den závodu (aplikace neběžela): okno končí o půlnoci, ostrá data zůstanou
  const late = run({ startedAt: new Date("2026-12-05T19:00:00.000Z") });
  assert.deepEqual(testDataWindow(late, new Date("2026-12-06T09:30:00.000Z"), CUTOFF_2026), {
    from: late.startedAt,
    until: CUTOFF_2026,
  });
});

test("dataEpoch changes with a new test run and with a new zero (Q72)", () => {
  const zero = new Date("2026-11-02T09:15:00.000Z");
  assert.equal(dataEpoch(null, zero), "live@2026-11-02T09:15:00.000Z");
  assert.equal(dataEpoch(run(), zero), "test-abc123def0@2026-11-02T09:15:00.000Z");
  assert.notEqual(dataEpoch(run({ id: "other12345" }), zero), dataEpoch(run(), zero));
  assert.notEqual(dataEpoch(null, new Date(zero.getTime() + 1000)), dataEpoch(null, zero));
});
