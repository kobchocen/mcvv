import assert from "node:assert/strict";
import { test } from "node:test";

import { asPodiumRank, podiumRank } from "@/components/molecules/runner-podium-badges";
import { runnerSex } from "@/lib/stats/core";

import {
  computeRunnerPeerIndex,
  courseRecordOf,
  podiumPlacesOf,
  type PeerResultRow,
} from "./peers";

/** The profile logic before #199: everything computed from all result rows per request. */
function legacyProfile(all: readonly PeerResultRow[], id: string) {
  const sex = runnerSex(id);
  const sexRecord = all
    .filter((row) => runnerSex(row.runnerId) === sex)
    .reduce((min, row) => Math.min(min, row.time), Number.POSITIVE_INFINITY);
  const rows = all.filter((row) => row.runnerId === id);
  return {
    sexRecord,
    places: rows.map((row) => {
      const inYear = all.filter((peer) => peer.year === row.year);
      return {
        year: row.year,
        absolute: asPodiumRank(
          podiumRank(
            inYear.filter((peer) => runnerSex(peer.runnerId) === sex),
            id,
          ),
        ),
        category: asPodiumRank(
          podiumRank(
            inYear.filter((peer) => peer.categoryId === row.categoryId),
            id,
          ),
        ),
      };
    }),
  };
}

function indexedProfile(all: readonly PeerResultRow[], id: string) {
  // The cached index travels as JSON (unstable_cache); compare after the round trip.
  const index = JSON.parse(JSON.stringify(computeRunnerPeerIndex(all)));
  return {
    sexRecord: courseRecordOf(index, runnerSex(id)),
    places: all
      .filter((row) => row.runnerId === id)
      .map((row) => ({ year: row.year, ...podiumPlacesOf(index, row.year, id) })),
  };
}

/** Deterministic pseudo-random results with many ties. */
function sampleResults(seed: number): PeerResultRow[] {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const rows: PeerResultRow[] = [];
  for (let runner = 0; runner < 120; runner += 1) {
    const sexDigit = next() < 0.4 ? 5 : 0;
    const id = `19${String(50 + (runner % 50)).padStart(2, "0")}${sexDigit}${String(runner).padStart(3, "0")}`;
    for (let year = 2000; year < 2012; year += 1) {
      if (next() < 0.5) continue;
      rows.push({
        runnerId: id,
        year,
        categoryId: "ABCDE"[Math.floor(next() * 5)],
        time: 1200 + Math.floor(next() * 40) * 10,
      });
    }
  }
  return rows;
}

test("peer index gives the same course record and podium places as the full scan", () => {
  for (const seed of [1, 7, 42, 2026]) {
    const all = sampleResults(seed);
    const ids = [...new Set(all.map((row) => row.runnerId))];
    for (const id of ids) {
      assert.deepEqual(indexedProfile(all, id), legacyProfile(all, id), `seed ${seed}, ${id}`);
    }
  }
});

test("ties share a place and the next place is skipped", () => {
  const rows: PeerResultRow[] = [
    { runnerId: "19800001", year: 2020, categoryId: "A", time: 1000 },
    { runnerId: "19800002", year: 2020, categoryId: "A", time: 1000 },
    { runnerId: "19800003", year: 2020, categoryId: "A", time: 1010 },
    { runnerId: "19800004", year: 2020, categoryId: "A", time: 1020 },
  ];
  const index = computeRunnerPeerIndex(rows);
  assert.deepEqual(podiumPlacesOf(index, 2020, "19800002"), { absolute: 1, category: 1 });
  assert.deepEqual(podiumPlacesOf(index, 2020, "19800003"), { absolute: 3, category: 3 });
  assert.deepEqual(podiumPlacesOf(index, 2020, "19800004"), {
    absolute: undefined,
    category: undefined,
  });
});

test("no results of a sex → infinite course record (as Math.min over no rows)", () => {
  const index = computeRunnerPeerIndex([
    { runnerId: "19800001", year: 2020, categoryId: "A", time: 1000 },
  ]);
  assert.equal(courseRecordOf(index, "M"), 1000);
  assert.equal(courseRecordOf(index, "F"), Number.POSITIVE_INFINITY);
});
