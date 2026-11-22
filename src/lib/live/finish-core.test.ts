import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkStamp,
  finishBatchSchema,
  markKept,
  netTime,
  parseFinishClock,
  pairFinish,
  planFinishSync,
  sortKeyBetween,
  summarizePairs,
  writablePairs,
  type FinishBibRow,
  type FinishPunchRow,
} from "./finish-core";

const ZERO = Date.UTC(2026, 11, 6, 9, 15, 0); // 10:15 Europe/Prague
/** Start čísla: interval 15 s, 2. start od 601 (stejně jako model ročníku). */
const startOf = (bib: number) =>
  bib >= 1 && bib <= 900 ? ZERO + 15_000 * ((bib >= 601 ? bib - 600 : bib) - 1) : null;

let seq = 0;
const punch = (at: number, extra: Partial<FinishPunchRow> = {}): FinishPunchRow => ({
  id: ++seq,
  entryKey: `p${seq}`,
  punchedAt: at,
  deleted: false,
  source: "watch",
  ...extra,
});
const bib = (n: number, order: number, extra: Partial<FinishBibRow> = {}): FinishBibRow => ({
  id: ++seq,
  entryKey: `b${seq}`,
  bib: n,
  readAt: order,
  sortKey: order,
  deleted: false,
  source: "bibs",
  ...extra,
});

test("netTime: finish minus planned start, whole seconds rounded down; late start not corrected", () => {
  assert.equal(netTime(ZERO + 1_000 * 900 + 999, ZERO), 900);
  // bib 5 starts at +60 s; a runner who started late still gets time from the start list
  assert.equal(netTime(ZERO + 60_000 + 1_000_000, startOf(5)!), 1000);
});

test("pairFinish pairs by order and computes net times for both start lines", () => {
  const punches = [punch(ZERO + 1_200_000), punch(ZERO + 1_100_000)];
  const bibs = [bib(601, 1), bib(2, 2)];
  const pairs = pairFinish(punches, bibs, startOf);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].bib!.bib, 601);
  assert.equal(pairs[0].time, 1100); // 601 starts with 1 at zero
  assert.equal(pairs[1].bib!.bib, 2);
  assert.equal(pairs[1].time, 1185); // 2 starts at +15 s
  assert.deepEqual(pairs[0].issues, []);
});

test("pairFinish flags missing bib / punch, unknown and duplicate bibs, too fast", () => {
  const punches = [
    punch(ZERO + 1_000_000),
    punch(ZERO + 1_010_000),
    punch(ZERO + 300_000 + 1_020_000),
  ];
  const bibs = [bib(1, 1), bib(1, 2), bib(950, 3), bib(3, 4)];
  const pairs = pairFinish(punches, bibs, startOf);
  // punches sorted by time: 1_000_000, 1_010_000, 1_320_000
  assert.equal(pairs.length, 4);
  assert.deepEqual(pairs[1].issues, ["duplicate-bib"]);
  assert.deepEqual(pairs[2].issues, ["unknown-bib"]);
  assert.deepEqual(pairs[3].issues, ["missing-punch"]);
  const short = pairFinish([punch(ZERO + 200_000)], [bib(1, 1)], startOf);
  assert.deepEqual(short[0].issues, ["too-fast"]);
  assert.equal(short[0].time, 200);
  const noBib = pairFinish([punch(ZERO + 1_000_000)], [], startOf);
  assert.deepEqual(noBib[0].issues, ["missing-bib"]);
  const before = pairFinish([punch(ZERO - 5_000)], [bib(1, 1)], startOf);
  assert.deepEqual(before[0].issues, ["too-long"]);
  assert.equal(before[0].time, null);
});

test("deleted punches and bibs are skipped; corrections only change order", () => {
  const punches = [
    punch(ZERO + 1_000_000),
    punch(ZERO + 1_000_500, { deleted: true }),
    punch(ZERO + 1_100_000),
  ];
  const bibs = [bib(2, 2), bib(1, 1), bib(7, 1.5, { deleted: true })];
  const pairs = pairFinish(punches, bibs, startOf);
  assert.deepEqual(
    pairs.map((p) => [p.bib!.bib, p.time]),
    [
      [1, 1000],
      [2, 1085],
    ],
  );
});

test("writablePairs keeps complete pairs with a known bib, first occurrence only", () => {
  const pairs = pairFinish(
    [punch(ZERO + 1_000_000), punch(ZERO + 1_001_000), punch(ZERO + 1_002_000)],
    [bib(1, 1), bib(1, 2), bib(999, 3)],
    startOf,
  );
  assert.deepEqual([...writablePairs(pairs)], [[1, 1000]]);
});

test("planFinishSync inserts, updates and removes only rows owned by pairing", () => {
  const desired = new Map([
    [1, 1000],
    [2, 1100],
    [3, 1200],
  ]);
  const plan = planFinishSync(desired, [
    { bib: 2, time: 1090, author: "cil" },
    { bib: 3, time: 1250, author: "admin" },
    { bib: 4, time: 900, author: "cil" },
    { bib: 5, time: 950, author: "admin" },
  ]);
  assert.deepEqual(plan.insert, [{ bib: 1, time: 1000 }]);
  assert.deepEqual(plan.update, [{ bib: 2, time: 1100, previous: 1090 }]);
  assert.deepEqual(plan.remove, [{ bib: 4, previous: 900 }]);
  assert.deepEqual(plan.kept, [3]);
  const marked = markKept(pairFinish([punch(ZERO + 1_000_000)], [bib(3, 1)], startOf), [3]);
  assert.ok(marked[0].issues.includes("manual-kept"));
});

test("sortKeyBetween inserts between neighbours, before the first and after the last", () => {
  assert.equal(sortKeyBetween(10, 20), 15);
  assert.equal(sortKeyBetween(null, 20), 20 - 1000);
  assert.equal(sortKeyBetween(10, null), 1010);
});

test("summarizePairs counts complete pairs and problems", () => {
  const pairs = pairFinish(
    [punch(ZERO + 1_000_000), punch(ZERO + 1_001_000)],
    [bib(1, 1)],
    startOf,
  );
  assert.deepEqual(summarizePairs(pairs), { punches: 2, bibs: 1, complete: 1, problems: 1 });
});

test("finishBatchSchema validates station ops; checkStamp refuses future and stale stamps", () => {
  const now = Date.UTC(2026, 11, 6, 10, 0, 0);
  assert.ok(
    finishBatchSchema.safeParse({
      ops: [
        { kind: "punch", id: "uuid-0001", at: now },
        { kind: "bib", id: "uuid-0002", at: now, bib: 12 },
        { kind: "delete", id: "uuid-0003", target: "uuid-0001" },
      ],
    }).success,
  );
  assert.equal(
    finishBatchSchema.safeParse({ ops: [{ kind: "bib", id: "uuid-0002", at: now, bib: 0 }] })
      .success,
    false,
  );
  assert.equal(finishBatchSchema.safeParse({ ops: [] }).success, false);
  assert.equal(checkStamp(now, now), "ok");
  assert.equal(checkStamp(now + 3 * 60_000, now), "future");
  assert.equal(checkStamp(now - 25 * 3600_000, now), "stale");
});

test("parseFinishClock reads hh:mm:ss with optional tenths in Europe/Prague", () => {
  assert.equal(parseFinishClock("10:40:05.3", "2026-12-06"), Date.UTC(2026, 11, 6, 9, 40, 5, 300));
  assert.equal(parseFinishClock("9:00:00", "2026-12-06"), Date.UTC(2026, 11, 6, 8, 0, 0));
  assert.equal(parseFinishClock("10:61:00", "2026-12-06"), null);
  assert.equal(parseFinishClock("x", "2026-12-06"), null);
});
