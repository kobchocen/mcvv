import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SPECIAL_SLOT_RANGES } from "./special-start";
import {
  DEFAULT_ORGANIZER_ZERO_SECONDS,
  DEFAULT_START_MODEL,
  FIRST_ORGANIZER_ZERO_YEAR,
  ORGANIZER_SLOT_RANGE,
  defaultOrganizerZeroSeconds,
  bibForSlot,
  compareByStart,
  organizerShiftSeconds,
  parseClock,
  startInstantForBib,
  startModelFromEdition,
  startOffsetFromZero,
  startSecondsForBib,
  startSeriesForBib,
  startSlot,
  startTimeForBib,
} from "./start-time";

describe("startTimeForBib", () => {
  const model = DEFAULT_START_MODEL;
  it("uses the organiser zero for bibs in slots 1–40 (#382)", () => {
    assert.equal(startTimeForBib(model, 1), "07:45:00");
    assert.equal(startTimeForBib(model, 40), "07:54:45");
    assert.equal(startTimeForBib(model, 601), "07:45:00");
    assert.equal(startTimeForBib(model, 640), "07:54:45");
    assert.equal(DEFAULT_ORGANIZER_ZERO_SECONDS, 7 * 3600 + 45 * 60);
  });
  it("keeps the edition zero for bibs outside the organiser range", () => {
    assert.equal(startTimeForBib(model, 41), "10:25:00");
    assert.equal(startTimeForBib(model, 301), "11:30:00");
    assert.equal(startTimeForBib(model, 600), "12:44:45");
    assert.equal(startTimeForBib(model, 641), "10:25:00");
    assert.equal(startTimeForBib(model, 901), "11:30:00");
    assert.equal(startTimeForBib(model, 400), "11:54:45");
    assert.equal(startTimeForBib(model, 950), "11:42:15");
  });
  it("treats overflow bibs (outside 1–40 / 601–640) as the edition zero", () => {
    assert.equal(startTimeForBib(model, 41), "10:25:00");
    assert.equal(startTimeForBib(model, 641), "10:25:00");
    assert.equal(startTimeForBib(model, 100), "10:39:45");
    assert.equal(startTimeForBib(model, 650), "10:27:15");
  });
  it("returns empty string for missing or invalid bibs", () => {
    assert.equal(startTimeForBib(model, null), "");
    assert.equal(startTimeForBib(model, 0), "");
    assert.equal(startTimeForBib(model, -3), "");
  });
  it("uses edition settings including a custom organiser zero", () => {
    const custom = startModelFromEdition({
      startZeroSeconds: 9 * 3600,
      startInterval: 30,
      secondStartFrom: 501,
      organizerZeroSeconds: 6 * 3600 + 30 * 60,
    });
    assert.equal(startTimeForBib(custom, 3), "06:31:00");
    assert.equal(startTimeForBib(custom, 41), "09:20:00");
    assert.equal(startTimeForBib(custom, 501), "06:30:00");
    assert.equal(startTimeForBib(custom, 540), "06:49:30");
    assert.equal(startTimeForBib(custom, 541), "09:20:00");
    assert.equal(startTimeForBib(custom, 600), "09:49:30");
  });
  it("falls back to defaults for empty edition values", () => {
    assert.deepEqual(startModelFromEdition(null), DEFAULT_START_MODEL);
    assert.deepEqual(startModelFromEdition({ startInterval: 0 }), DEFAULT_START_MODEL);
    assert.equal(startModelFromEdition({ organizerZeroSeconds: null }).organizerZeroSeconds, 27900);
  });
  it("does not shift organisers on historical editions when the column is NULL", () => {
    assert.equal(FIRST_ORGANIZER_ZERO_YEAR, 2026);
    assert.equal(defaultOrganizerZeroSeconds(2025, 36900), 36900);
    assert.equal(defaultOrganizerZeroSeconds(2026, 36900), 27900);
    const past = startModelFromEdition(
      {
        startZeroSeconds: 36900,
        startInterval: 15,
        secondStartFrom: 601,
        organizerZeroSeconds: null,
      },
      2025,
    );
    assert.equal(past.organizerZeroSeconds, 36900);
    assert.equal(startTimeForBib(past, 1), "10:15:00");
    assert.equal(startTimeForBib(past, 40), "10:24:45");
    assert.equal(startTimeForBib(past, 41), "10:25:00");
    assert.equal(startTimeForBib(past, 601), "10:15:00");
    const fromDate = startModelFromEdition({
      startZeroSeconds: 36900,
      organizerZeroSeconds: null,
      date: new Date("2024-12-01T00:00:00Z"),
    });
    assert.equal(startTimeForBib(fromDate, 1), "10:15:00");
    const current = startModelFromEdition(
      { startZeroSeconds: 36900, organizerZeroSeconds: null },
      2026,
    );
    assert.equal(startTimeForBib(current, 1), "07:45:00");
    const future = startModelFromEdition(
      { startZeroSeconds: 36900, organizerZeroSeconds: null },
      2027,
    );
    assert.equal(startTimeForBib(future, 1), "07:45:00");
    // explicit value on an older edition is kept
    const stored = startModelFromEdition(
      { startZeroSeconds: 36900, organizerZeroSeconds: 7 * 3600 },
      2024,
    );
    assert.equal(startTimeForBib(stored, 1), "07:00:00");
  });
  it("can put organisers on the same zero as the field", () => {
    const same = { ...DEFAULT_START_MODEL, organizerZeroSeconds: DEFAULT_START_MODEL.zeroSeconds };
    assert.equal(startTimeForBib(same, 1), "10:15:00");
    assert.equal(startTimeForBib(same, 601), "10:15:00");
    assert.equal(startTimeForBib(same, 41), "10:25:00");
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
  it("keeps the organiser slot range in sync with special-start ranges", () => {
    assert.deepEqual(ORGANIZER_SLOT_RANGE, SPECIAL_SLOT_RANGES.organizer);
  });
  it("interleaves both starts by actual start time", () => {
    const sorted = [902, 41, 601, 1, 641, 301, 40].sort((a, b) => compareByStart(model, a, b));
    assert.deepEqual(sorted, [1, 601, 40, 41, 641, 301, 902]);
  });
  it("exposes the organiser shift used by the live path", () => {
    assert.equal(organizerShiftSeconds(model), 27900 - 36900);
    assert.equal(startOffsetFromZero(model, 1), -9000);
    assert.equal(startOffsetFromZero(model, 40), -9000 + 39 * 15);
    assert.equal(startOffsetFromZero(model, 41), 40 * 15);
    assert.equal(startSecondsForBib(model, 1), 27900);
  });
});

describe("startInstantForBib", () => {
  it("converts through Europe/Prague (CET in December), including organisers", () => {
    const date = new Date("2026-12-06T00:00:00Z");
    assert.equal(
      startInstantForBib(DEFAULT_START_MODEL, date, 41)?.toISOString(),
      "2026-12-06T09:25:00.000Z",
    );
    assert.equal(
      startInstantForBib(DEFAULT_START_MODEL, date, 1)?.toISOString(),
      "2026-12-06T06:45:00.000Z",
    );
  });
});

describe("parseClock", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    assert.equal(parseClock("10:15"), 36900);
    assert.equal(parseClock("10:15:30"), 36930);
    assert.equal(parseClock("9:05"), 32700);
    assert.equal(parseClock("7:45"), 27900);
  });
  it("rejects invalid input", () => {
    assert.equal(parseClock("25:00"), null);
    assert.equal(parseClock("10:60"), null);
    assert.equal(parseClock("abc"), null);
    assert.equal(parseClock(""), null);
  });
});
