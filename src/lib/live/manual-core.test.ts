import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clockToRaceTime,
  conflictExistingTime,
  conflictStillCurrent,
  isManualSplit,
  isValidBib,
  normalizeReason,
  orderProblems,
  parseExpected,
  parseRaceTime,
} from "./manual-core";

test("parseRaceTime accepts m:ss, h:mm:ss and seconds within 0–6 h", () => {
  assert.equal(parseRaceTime("28:06"), 1686);
  assert.equal(parseRaceTime("5:00"), 300);
  assert.equal(parseRaceTime("1:02:03"), 3723);
  assert.equal(parseRaceTime("1686"), 1686);
  assert.equal(parseRaceTime(" 0:00 "), 0);
  assert.equal(parseRaceTime("75:10"), 4510);
  assert.equal(parseRaceTime("6:00:00"), 21600);
  assert.equal(parseRaceTime("6:00:01"), null);
  assert.equal(parseRaceTime("1:60"), null);
  assert.equal(parseRaceTime("1:61:00"), null);
  assert.equal(parseRaceTime("-5"), null);
  assert.equal(parseRaceTime("abc"), null);
  assert.equal(parseRaceTime(""), null);
});

test("clockToRaceTime converts Prague wall clock on the zero day to seconds since start", () => {
  const zero = new Date("2026-12-06T09:15:00.000Z"); // 10:15 CET
  assert.equal(clockToRaceTime("10:43:06", zero, 1, 15), 1686);
  // bib 3 starts 30 s later, bib 601 together with bib 1
  assert.equal(clockToRaceTime("10:43:06", zero, 3, 15), 1656);
  assert.equal(clockToRaceTime("10:43:06", zero, 601, 15), 1686);
  assert.equal(clockToRaceTime("10:43", zero, 1, 15), 1680);
  assert.equal(clockToRaceTime("10:14:59", zero, 1, 15), null);
  assert.equal(clockToRaceTime("25:00", zero, 1, 15), null);
  assert.equal(clockToRaceTime("x", zero, 1, 15), null);
});

test("bib, split, reason and expected value", () => {
  assert.equal(isValidBib(1), true);
  assert.equal(isValidBib(999), true);
  assert.equal(isValidBib(0), false);
  assert.equal(isValidBib(1.5), false);
  assert.equal(isManualSplit("9", ["1", "3"]), true);
  assert.equal(isManualSplit("1", ["1", "3"]), true);
  assert.equal(isManualSplit("2", ["1", "3"]), false);
  assert.equal(isManualSplit("10", ["1", "3"]), false);
  assert.equal(normalizeReason("  špatně \n opsané  číslo "), "špatně opsané číslo");
  assert.equal(normalizeReason("x".repeat(300)).length, 200);
  assert.equal(parseExpected(""), null);
  assert.equal(parseExpected("1686"), 1686);
  assert.equal(parseExpected("x"), undefined);
});

test("orderProblems flags non-increasing times, finish last", () => {
  assert.deepEqual(orderProblems({ "1": 300, "3": 700, "9": 1600 }), []);
  assert.deepEqual(orderProblems({ "9": 600, "1": 300, "3": 700 }), ["9"]);
  assert.deepEqual(orderProblems({ "1": 800, "3": 700 }), ["3"]);
  assert.deepEqual(orderProblems({ "9": 1600 }), []);
});

test("resolveConflict guard: conflict must still match the stored value", () => {
  assert.equal(conflictExistingTime("existing=1686"), 1686);
  assert.equal(conflictExistingTime("unknown-bib;existing=12"), 12);
  assert.equal(conflictExistingTime("unknown-bib"), null);
  assert.equal(conflictStillCurrent("existing=1686", { time: 1686 }), true);
  assert.equal(conflictStillCurrent("existing=1686", { time: 1700 }), false);
  assert.equal(conflictStillCurrent("existing=1686", null), false);
  assert.equal(conflictStillCurrent(null, null), true);
  assert.equal(conflictStillCurrent(null, { time: 5 }), false);
});
