import assert from "node:assert/strict";
import { test } from "node:test";

import { clubMergeHistoryEntry } from "./merge-history";

const createdAt = new Date("2026-11-01T10:00:00Z");

test("admin merge: counts from the detail, merged name = latest edition name", () => {
  const entry = clubMergeHistoryEntry({
    id: 7,
    createdAt,
    actorEmail: "admin@example.test",
    target: "club:CHC",
    detail: {
      version: 1,
      source: "admin",
      main: "CHC",
      merged: "CHO",
      counts: { mcvv_prihlaska_radek: 2, mcvv_start: 3, mcvv_time: 4 },
      cisKlub: {
        moved: [{ rok: 2019, jmeno: "KOB Choceň" }],
        dropped: [{ rok: 2021, jmeno: "K.O.B. Choceň" }],
        created: [],
      },
      rows: { mcvv_prihlaska_radek: [], mcvv_start: [], mcvv_time: [] },
    },
  });
  assert.equal(entry.source, "admin");
  assert.equal(entry.at, createdAt);
  assert.equal(entry.main, "CHC");
  assert.equal(entry.merged, "CHO");
  assert.equal(entry.mergedName, "K.O.B. Choceň");
  assert.deepEqual(entry.counts, { entries: 2, starts: 3, results: 4 });
});

test("migration merge (Q246): no counts → row key lists, time from mergedAt", () => {
  const entry = clubMergeHistoryEntry({
    id: 8,
    createdAt,
    actorEmail: "migrace",
    target: "club:111",
    detail: {
      source: "migration",
      main: "111",
      merged: "112",
      mergedAt: "2026-05-04 12:30:00.000",
      cisKlub: { moved: [{ rok: "2018", jmeno: "Loko" }], dropped: [] },
      rows: {
        mcvv_prihlaska_radek: [[2018, "A"]],
        mcvv_start: [
          [2018, "A"],
          [2018, "B"],
        ],
        mcvv_time: [],
      },
    },
  });
  assert.equal(entry.source, "migration");
  assert.equal(entry.at.toISOString(), "2026-05-04T12:30:00.000Z");
  assert.equal(entry.mergedName, "Loko");
  assert.deepEqual(entry.counts, { entries: 1, starts: 2, results: 0 });
});

test("broken detail does not throw", () => {
  const entry = clubMergeHistoryEntry({
    id: 9,
    createdAt,
    actorEmail: "x",
    target: "club:ABC",
    detail: null,
  });
  assert.equal(entry.main, "ABC");
  assert.equal(entry.merged, "?");
  assert.equal(entry.mergedName, null);
  assert.deepEqual(entry.counts, { entries: 0, starts: 0, results: 0 });
});
