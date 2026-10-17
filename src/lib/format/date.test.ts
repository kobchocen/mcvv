import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDate, formatRaceDate, formatRaceDay } from "./date";

const plain = (value: string) => value.replace(/\s/g, " ");

test("formatDate uses Czech numeric format and English short month", () => {
  const deadline = new Date(Date.UTC(2026, 11, 2));
  assert.equal(plain(formatDate(deadline, "cs")), "2. 12. 2026");
  assert.equal(plain(formatDate(deadline, "en")), "2 Dec 2026");
});

test("formatDate is evaluated in Europe/Prague", () => {
  // 23:30 UTC on 1 Dec is already 2 Dec in Prague (UTC+1 in winter).
  assert.equal(plain(formatDate(new Date(Date.UTC(2026, 11, 1, 23, 30)), "cs")), "2. 12. 2026");
});

test("race date formats", () => {
  const race = new Date(Date.UTC(2026, 11, 6));
  assert.equal(plain(formatRaceDate(race, "cs")), "Neděle 6. 12. 2026");
  assert.equal(plain(formatRaceDate(race, "en")), "Sunday 6 December 2026");
  assert.equal(plain(formatRaceDay(race, "cs")), "Neděle 6. prosince");
  assert.equal(plain(formatRaceDay(race, "en")), "Sunday 6 December");
});
