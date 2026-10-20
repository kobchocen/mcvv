import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_START_MODEL,
  bibForSlot,
  compareByStart,
  parseClock,
  startInstantForBib,
  startModelFromEdition,
  startSeriesForBib,
  startSlot,
  startTimeForBib,
} from "./start-time";

describe("startTimeForBib", () => {
  const model = DEFAULT_START_MODEL;
  it("matches the legacy examples (10:15, 15 s, 2nd start from 601)", () => {
    assert.equal(startTimeForBib(model, 1), "10:15:00");
    assert.equal(startTimeForBib(model, 41), "10:25:00");
    assert.equal(startTimeForBib(model, 301), "11:30:00");
    assert.equal(startTimeForBib(model, 600), "12:44:45");
    assert.equal(startTimeForBib(model, 601), "10:15:00");
    assert.equal(startTimeForBib(model, 641), "10:25:00");
    assert.equal(startTimeForBib(model, 901), "11:30:00");
    assert.equal(startTimeForBib(model, 400), "11:54:45");
    assert.equal(startTimeForBib(model, 950), "11:42:15");
  });
  it("returns empty string for missing or invalid bibs", () => {
    assert.equal(startTimeForBib(model, null), "");
    assert.equal(startTimeForBib(model, 0), "");
    assert.equal(startTimeForBib(model, -3), "");
  });
  it("uses edition settings", () => {
    const custom = startModelFromEdition({
      startZeroSeconds: 9 * 3600,
      startInterval: 30,
      secondStartFrom: 501,
    });
    assert.equal(startTimeForBib(custom, 3), "09:01:00");
    assert.equal(startTimeForBib(custom, 501), "09:00:00");
    assert.equal(startTimeForBib(custom, 600), "09:49:30");
  });
  it("falls back to defaults for empty edition values", () => {
    assert.deepEqual(startModelFromEdition(null), DEFAULT_START_MODEL);
    assert.deepEqual(startModelFromEdition({ startInterval: 0 }), DEFAULT_START_MODEL);
  });
});

describe("slots and series", () => {
  const model = DEFAULT_START_MODEL;
  it("maps bibs to series and slots and back", () => {
    assert.equal(startSeriesForBib(model, 600), 1);
    assert.equal(startSeriesForBib(model, 601), 2);
    assert.equal(startSlot(model, 641), 41);
    assert.equal(bibForSlot(model, 2, 41), 641);
    assert.equal(bibForSlot(model, 1, 41), 41);
  });
  it("interleaves both starts by time", () => {
    const sorted = [902, 41, 601, 1, 641, 301].sort((a, b) => compareByStart(model, a, b));
    assert.deepEqual(sorted, [1, 601, 41, 641, 301, 902]);
  });
});

describe("startInstantForBib", () => {
  it("converts through Europe/Prague (CET in December)", () => {
    const instant = startInstantForBib(DEFAULT_START_MODEL, new Date("2026-12-06T00:00:00Z"), 41);
    assert.equal(instant?.toISOString(), "2026-12-06T09:25:00.000Z");
  });
});

describe("parseClock", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    assert.equal(parseClock("10:15"), 36900);
    assert.equal(parseClock("10:15:30"), 36930);
    assert.equal(parseClock("9:05"), 32700);
  });
  it("rejects invalid input", () => {
    assert.equal(parseClock("25:00"), null);
    assert.equal(parseClock("10:60"), null);
    assert.equal(parseClock("abc"), null);
    assert.equal(parseClock(""), null);
  });
});
