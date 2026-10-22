import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDate, formatRaceDate, formatRaceDay, formatShortDateTime } from "./date";

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

test("formatShortDateTime drops the year within the same Prague year", () => {
  const now = new Date(Date.UTC(2026, 9, 22, 13, 0));
  const read = new Date(Date.UTC(2026, 9, 22, 12, 5)); // 14:05 CEST
  assert.equal(plain(formatShortDateTime(read, "cs", now)), "22. 10. 14:05");
  assert.equal(plain(formatShortDateTime(read, "en", now)), "22 Oct, 14:05");
  const lastYear = new Date(Date.UTC(2025, 11, 31, 22, 30)); // 23:30 CET
  assert.equal(plain(formatShortDateTime(lastYear, "cs", now)), "31. 12. 2025 23:30");
});
