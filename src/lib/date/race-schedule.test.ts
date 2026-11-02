import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_RACE_ZERO_SECONDS,
  formatStartClock,
  getEditionStart,
  resolveRaceCountdown,
} from "./race-schedule";

test("default zero is 10:15 and formats without seconds", () => {
  assert.equal(DEFAULT_RACE_ZERO_SECONDS, 36_900);
  assert.equal(formatStartClock(DEFAULT_RACE_ZERO_SECONDS), "10:15");
  assert.equal(formatStartClock(9 * 3600 + 30 * 60), "9:30");
  assert.equal(formatStartClock(9 * 3600 + 30 * 60 + 5), "9:30:05");
});

test("edition start and countdown follow the edition zero", () => {
  assert.equal(getEditionStart(2026).toISOString(), "2026-12-06T09:15:00.000Z");
  const zero930 = 9 * 3600 + 30 * 60;
  assert.equal(getEditionStart(2026, zero930).toISOString(), "2026-12-06T08:30:00.000Z");
  // 9:00 Prague on race day: with a 9:30 zero the race is still upcoming
  const now = new Date("2026-12-06T08:00:00.000Z");
  assert.equal(
    resolveRaceCountdown(now, zero930).target?.toISOString(),
    "2026-12-06T08:30:00.000Z",
  );
  // 9:45 Prague: started with a 9:30 zero, still upcoming with the default 10:15
  const later = new Date("2026-12-06T08:45:00.000Z");
  assert.equal(resolveRaceCountdown(later, zero930).phase, "in-progress");
  assert.equal(resolveRaceCountdown(later).phase, "upcoming");
});
