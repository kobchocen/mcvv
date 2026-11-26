import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  pickSeedTime,
  seedTimesByRunner,
  seedTimeWindow,
  SEED_TIME_LOOKBACK_YEARS,
} from "./startlist-seed-time";

const YEAR = 2026;

describe("seedTimeWindow", () => {
  it("covers the three previous years, not the race year", () => {
    assert.equal(SEED_TIME_LOOKBACK_YEARS, 3);
    assert.deepEqual(seedTimeWindow(YEAR), { from: 2023, to: 2025 });
  });
});

describe("pickSeedTime", () => {
  it("uses last year's time when it exists", () => {
    assert.equal(pickSeedTime([{ year: 2025, time: 1100 }], YEAR), 1100);
  });

  it("falls back to two years ago when last year is missing", () => {
    assert.equal(pickSeedTime([{ year: 2024, time: 980 }], YEAR), 980);
  });

  it("falls back to three years ago when only that time exists", () => {
    assert.equal(pickSeedTime([{ year: 2023, time: 1200 }], YEAR), 1200);
  });

  it("prefers the most recent year, not the fastest time in the window", () => {
    assert.equal(
      pickSeedTime(
        [
          { year: 2023, time: 800 },
          { year: 2024, time: 900 },
          { year: 2025, time: 1100 },
        ],
        YEAR,
      ),
      1100,
    );
  });

  it("uses two years ago when last year is missing even if three years ago is faster", () => {
    assert.equal(
      pickSeedTime(
        [
          { year: 2023, time: 700 },
          { year: 2024, time: 1000 },
        ],
        YEAR,
      ),
      1000,
    );
  });

  it("ignores time 0 even when it is the most recent year", () => {
    assert.equal(
      pickSeedTime(
        [
          { year: 2025, time: 0 },
          { year: 2024, time: 950 },
        ],
        YEAR,
      ),
      950,
    );
  });

  it("ignores a lone time of 0", () => {
    assert.equal(pickSeedTime([{ year: 2025, time: 0 }], YEAR), null);
  });

  it("ignores the current race year and years older than the window", () => {
    assert.equal(
      pickSeedTime(
        [
          { year: 2026, time: 500 },
          { year: 2022, time: 600 },
        ],
        YEAR,
      ),
      null,
    );
  });

  it("returns null when there are no results", () => {
    assert.equal(pickSeedTime([], YEAR), null);
  });
});

describe("seedTimesByRunner", () => {
  it("picks a time per runner from the most recent year in the window", () => {
    const map = seedTimesByRunner(
      [
        { runnerId: "only-last", year: 2025, time: 1000 },
        { runnerId: "skip-last", year: 2024, time: 900 },
        { runnerId: "skip-last", year: 2023, time: 800 },
        { runnerId: "zero-last", year: 2025, time: 0 },
        { runnerId: "zero-last", year: 2023, time: 1200 },
        { runnerId: "too-old", year: 2022, time: 700 },
      ],
      YEAR,
    );
    assert.equal(map.get("only-last"), 1000);
    assert.equal(map.get("skip-last"), 900);
    assert.equal(map.get("zero-last"), 1200);
    assert.equal(map.has("too-old"), false);
  });
});
