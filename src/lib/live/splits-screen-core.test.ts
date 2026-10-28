import assert from "node:assert/strict";
import { test } from "node:test";

import type { RecordState, SplitRecord } from "./queue-core";
import {
  correctedNow,
  countRecords,
  RECENT_LIMIT,
  recentRecords,
  relativeTime,
} from "./splits-screen-core";
import { START_STATION } from "./stations";

const zero = new Date("2026-12-06T09:15:00.000Z"); // 10:15 Europe/Prague

let seq = 0;
function rec(split: string, state: RecordState, bib: number | null = 1): SplitRecord {
  seq += 1;
  const id = `r${seq}`;
  return { id, currentKey: id, split, bib, punchedAt: zero.getTime() + seq * 1000, state };
}

test("recentRecords keeps only the newest N for the station, in order", () => {
  const records = [
    ...Array.from({ length: 15 }, () => rec("1", "applied")),
    rec("3", "applied"),
    rec("1", "pending"),
  ];
  const recent = recentRecords(records, "1");
  assert.equal(RECENT_LIMIT, 10);
  assert.equal(recent.length, 10);
  assert.deepEqual(
    recent.map((r) => r.id),
    records
      .filter((r) => r.split === "1")
      .slice(0, 10)
      .map((r) => r.id),
  );
  assert.equal(recentRecords(records, "3").length, 1);
  assert.equal(recentRecords(records, "5").length, 0);
  assert.equal(recentRecords(records, "1", 3).length, 3);
});

test("recentRecords works for the Start station", () => {
  const records = Array.from({ length: 12 }, () => rec(START_STATION, "applied"));
  assert.equal(recentRecords(records, START_STATION).length, 10);
});

test("countRecords: station count, sent at station and total sent", () => {
  const records = [
    rec("1", "applied"),
    rec("1", "applied"),
    rec("1", "pending"),
    rec("1", "error"),
    rec("1", "rejected"),
    rec("1", "duplicate"),
    rec("1", "deleted"),
    rec("1", "draft", null),
    rec("3", "applied"),
    rec(START_STATION, "applied"),
    rec(START_STATION, "pending"),
  ];
  // 1: applied ×2, pending, error, rejected, duplicate = 6 zapsaných, 2 uložené
  assert.deepEqual(countRecords(records, "1"), { station: 6, stationSent: 2, totalSent: 4 });
  assert.deepEqual(countRecords(records, START_STATION), {
    station: 2,
    stationSent: 1,
    totalSent: 4,
  });
  assert.deepEqual(countRecords([], "1"), { station: 0, stationSent: 0, totalSent: 0 });
});

test("relativeTime for a split: race time, before start, too long", () => {
  const base = { atStart: false, zero, intervalS: 15 };
  // číslo 1 startuje v nule, 5:30 po startu
  assert.deepEqual(relativeTime({ ...base, bib: 1, punchedAt: zero.getTime() + 330_500 }), {
    kind: "time",
    text: "5:30",
    estimate: true,
  });
  // server potvrdil čas
  assert.deepEqual(relativeTime({ ...base, bib: 1, punchedAt: 0, serverTime: 401 }), {
    kind: "time",
    text: "6:41",
    estimate: false,
  });
  // test o 44 dní dřív -> žádné „≈ -64277:00“
  const early = zero.getTime() - 64277 * 60_000;
  assert.deepEqual(relativeTime({ ...base, bib: 1, punchedAt: early }), { kind: "before-start" });
  // číslo 41 startuje 10:25, zápis v 10:20 je před jeho startem
  assert.deepEqual(relativeTime({ ...base, bib: 41, punchedAt: zero.getTime() + 300_000 }), {
    kind: "before-start",
  });
  // druhý den
  assert.deepEqual(relativeTime({ ...base, bib: 1, punchedAt: zero.getTime() + 86_400_000 }), {
    kind: "too-long",
  });
});

test("relativeTime for Start: offset from the planned start, far offsets hidden", () => {
  const base = { atStart: true, zero, intervalS: 15 };
  // číslo 2 má start 10:15:15, zápis 10:15:20 = +0:05
  assert.deepEqual(relativeTime({ ...base, bib: 2, punchedAt: zero.getTime() + 20_000 }), {
    kind: "time",
    text: "+0:05",
    estimate: true,
  });
  assert.deepEqual(relativeTime({ ...base, bib: 2, punchedAt: zero.getTime() + 5_000 }), {
    kind: "time",
    text: "-0:10",
    estimate: true,
  });
  assert.deepEqual(relativeTime({ ...base, bib: 2, punchedAt: 0, serverTime: -3 }), {
    kind: "time",
    text: "-0:03",
    estimate: false,
  });
  assert.deepEqual(relativeTime({ ...base, bib: 1, punchedAt: zero.getTime() - 3_600_000 }), {
    kind: "start-far-early",
  });
  assert.deepEqual(relativeTime({ ...base, bib: 1, punchedAt: 0, serverTime: 7200 }), {
    kind: "start-far-late",
  });
});

test("correctedNow applies the clock offset when known", () => {
  assert.equal(correctedNow(1_000, 250), 1_250);
  assert.equal(correctedNow(1_000, -400), 600);
  assert.equal(correctedNow(1_000, null), 1_000);
});
