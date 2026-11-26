import assert from "node:assert/strict";
import { test } from "node:test";

import { fieldCounts } from "./splits-field-core";
import type { Station } from "./stations";

const stations: Station[] = [
  { code: "1", label: "1,3 km", position: 13, public: true },
  { code: "3", label: "2,7 km", position: 27, public: true },
];

test("fieldCounts for the first split: previous segment is started but not yet here", () => {
  const counts = fieldCounts({
    station: "1",
    stations,
    rosterBibs: [1, 2, 3, 4, 5],
    startedBibs: new Set([1, 2, 3, 4]),
    splits: [
      { bib: 1, split: "1" },
      { bib: 1, split: "3" },
      { bib: 1, split: "9" },
      { bib: 2, split: "1" },
      { bib: 3, split: "9" },
    ],
  });
  // 5 je bez startu; 1,2,3,4 odstartovali; 4 je na trati před 1,3 km;
  // 2 prošel u 1,3 km (a zůstal); 1 prošel a doběhl; 3 doběhl bez této kontroly (nepočítá se do předchozího).
  assert.deepEqual(counts, {
    waitingStart: 1,
    started: 4,
    previousSegment: 1,
    passedHere: 2,
    finished: 2,
  });
});

test("fieldCounts for the second split requires a punch at the previous one", () => {
  const counts = fieldCounts({
    station: "3",
    stations,
    rosterBibs: [1, 2, 3],
    startedBibs: new Set([1, 2, 3]),
    splits: [
      { bib: 1, split: "1" },
      { bib: 2, split: "1" },
      { bib: 2, split: "3" },
      { bib: 3, split: "1" },
      { bib: 3, split: "3" },
      { bib: 3, split: "9" },
    ],
  });
  assert.deepEqual(counts, {
    waitingStart: 0,
    started: 3,
    previousSegment: 1,
    passedHere: 2,
    finished: 1,
  });
});

test("fieldCounts at Start: previous segment is empty, passedHere is start checks", () => {
  const counts = fieldCounts({
    station: "0",
    stations,
    rosterBibs: [1, 2, 3],
    startedBibs: new Set([1, 2]),
    splits: [{ bib: 3, split: "1" }],
  });
  // 3 odstartoval podle mezičasu, ale startér ho neoznačil → v „prošlo u mě“ na Startu není.
  assert.deepEqual(counts, {
    waitingStart: 0,
    started: 3,
    previousSegment: 0,
    passedHere: 2,
    finished: 0,
  });
});
