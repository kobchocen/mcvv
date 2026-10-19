import assert from "node:assert/strict";
import { test } from "node:test";

import { isRunnerProfileMissing, summarizeRunnerResults } from "./profile";

test("no results → null summary (first-timer profile, not 404)", () => {
  assert.equal(summarizeRunnerResults([]), null);
});

test("summary aggregates record, average and starts", () => {
  assert.deepEqual(summarizeRunnerResults([{ time: 1300 }, { time: 1200 }, { time: 1251 }]), {
    starts: 3,
    record: 1200,
    average: 1250,
  });
});

test("single result → record equals average", () => {
  assert.deepEqual(summarizeRunnerResults([{ time: 999 }]), {
    starts: 1,
    record: 999,
    average: 999,
  });
});

test("404 only when runner record is missing", () => {
  assert.equal(isRunnerProfileMissing(null), true);
  assert.equal(isRunnerProfileMissing(undefined), true);
  assert.equal(isRunnerProfileMissing({ name: "Březina Kamil" }), false);
});
