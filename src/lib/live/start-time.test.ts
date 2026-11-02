import assert from "node:assert/strict";
import { test } from "node:test";

import { formatRaceTime, secondsSinceStart, startInstant, startOffsetSeconds } from "./start-time";

const zero = new Date("2026-12-06T09:15:00.000Z"); // 10:15 Europe/Prague

test("legacy examples from the audit (kap. 3.2)", () => {
  const hhmmss = (bib: number) =>
    startInstant(zero, bib, 15, 601).toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague" });
  assert.equal(hhmmss(1), "10:15:00");
  assert.equal(hhmmss(601), "10:15:00");
  assert.equal(hhmmss(41), "10:25:00");
  assert.equal(hhmmss(641), "10:25:00");
  assert.equal(hhmmss(301), "11:30:00");
  assert.equal(hhmmss(901), "11:30:00");
});

test("offset and validation", () => {
  assert.equal(startOffsetSeconds(2, 15, 601), 15);
  assert.equal(startOffsetSeconds(602, 20, 601), 20);
  assert.throws(() => startOffsetSeconds(0, 15, 601));
  assert.throws(() => startOffsetSeconds(1.5, 15, 601));
});

test("seconds since start floors like legacy time() − start", () => {
  const at = new Date(zero.getTime() + 15_000 + 28 * 60_000 + 6_900);
  assert.equal(secondsSinceStart(zero, 2, at, 15, 601), 28 * 60 + 6);
  assert.equal(formatRaceTime(1686), "28:06");
  assert.equal(formatRaceTime(-5), "-0:05");
});

test("second-start boundary comes from the edition model (st_druhy_od = 501)", () => {
  const hhmmss = (bib: number) =>
    startInstant(zero, bib, 15, 501).toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague" });
  assert.equal(hhmmss(1), "10:15:00");
  assert.equal(hhmmss(501), "10:15:00");
  assert.equal(hhmmss(541), "10:25:00");
  assert.equal(hhmmss(500), "12:19:45");
  // 600 / 601 už jsou ve 2. startu (sloty 100 / 101), ne pod pevnou hranicí 600
  assert.equal(hhmmss(600), "10:39:45");
  assert.equal(hhmmss(601), "10:40:00");
  assert.equal(startOffsetSeconds(601, 15, 501), 1500);
  assert.equal(secondsSinceStart(zero, 502, new Date(zero.getTime() + 20_500), 15, 501), 5);
});
