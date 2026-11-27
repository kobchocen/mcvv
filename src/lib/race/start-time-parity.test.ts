import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { startInstant, startOffsetSeconds } from "@/lib/live/start-time";

import {
  DEFAULT_START_MODEL,
  organizerShiftSeconds,
  startInstantForBib,
  startOffsetFromZero,
  startSecondsForBib,
  startTimeForBib,
  type StartModel,
} from "./start-time";

/**
 * Race (`src/lib/race/start-time.ts`) a live (`src/lib/live/start-time.ts`) musí pro stejný
 * model dávat stejný startovní čas. Pokrývá čísla z #382: 1, 40, 41, 601, 640, 641 a overflow.
 */
const BIBS = [1, 40, 41, 100, 601, 640, 641, 650] as const;
const RACE_DATE = new Date("2026-12-06T00:00:00Z");
const OFFICIAL_ZERO = new Date("2026-12-06T09:15:00.000Z"); // 10:15 Europe/Prague

function clocks(model: StartModel, bib: number) {
  const shift = organizerShiftSeconds(model);
  const raceClock = startTimeForBib(model, bib);
  const liveDate = startInstant(
    OFFICIAL_ZERO,
    bib,
    model.intervalSeconds,
    model.secondStartFrom,
    shift,
  );
  const liveClock = liveDate.toLocaleTimeString("en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const raceInstant = startInstantForBib(model, RACE_DATE, bib);
  return { raceClock, liveClock, raceInstant, liveDate, shift };
}

describe("race vs live start-time parity (#382)", () => {
  it("matches for the default model (7:45 organisers, 10:15 field)", () => {
    const model = DEFAULT_START_MODEL;
    const expected: Record<number, string> = {
      1: "07:45:00",
      40: "07:54:45",
      41: "10:25:00",
      100: "10:39:45",
      601: "07:45:00",
      640: "07:54:45",
      641: "10:25:00",
      650: "10:27:15",
    };
    for (const bib of BIBS) {
      const { raceClock, liveClock, raceInstant, liveDate, shift } = clocks(model, bib);
      assert.equal(raceClock, expected[bib], `race clock bib ${bib}`);
      assert.equal(liveClock, expected[bib], `live clock bib ${bib}`);
      assert.equal(liveDate.toISOString(), raceInstant?.toISOString(), `instant bib ${bib}`);
      assert.equal(
        startOffsetSeconds(bib, model.intervalSeconds, model.secondStartFrom, shift),
        startOffsetFromZero(model, bib),
      );
    }
  });

  it("matches for a custom second start and organiser zero", () => {
    const model: StartModel = {
      zeroSeconds: 9 * 3600,
      intervalSeconds: 30,
      secondStartFrom: 501,
      organizerZeroSeconds: 6 * 3600 + 30 * 60,
    };
    const officialZero = new Date("2026-12-06T08:00:00.000Z"); // 09:00 Prague
    const shift = organizerShiftSeconds(model);
    for (const bib of [1, 40, 41, 501, 540, 541, 600, 601]) {
      const raceSec = startSecondsForBib(model, bib);
      assert.ok(raceSec != null);
      const live = startInstant(
        officialZero,
        bib,
        model.intervalSeconds,
        model.secondStartFrom,
        shift,
      );
      const liveClock = live.toLocaleTimeString("en-GB", {
        timeZone: "Europe/Prague",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      assert.equal(liveClock, startTimeForBib(model, bib), `bib ${bib}`);
    }
  });
});
