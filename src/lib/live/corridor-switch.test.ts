import assert from "node:assert/strict";
import { test } from "node:test";

import { prestartCountdown } from "./prestarter-core";
import { acceptsSnapshot, snapshotForCorridor } from "./starter-core";

type Snap = { corridor: 1 | 2; runners: number[] };
const c1: Snap = { corridor: 1, runners: [131, 301] };
const c2: Snap = { corridor: 2, runners: [861, 901] };

test("queue only shows the start list of the corridor on the label", () => {
  assert.equal(snapshotForCorridor(c1, 2), null);
  assert.equal(snapshotForCorridor(c2, 2), c2);
  assert.equal(snapshotForCorridor(null, 1), null);
  assert.equal(snapshotForCorridor(undefined, 1), null);
});

test("stale or aborted responses are dropped", () => {
  assert.equal(acceptsSnapshot(c1, 2), false, "answer for the previous corridor");
  assert.equal(acceptsSnapshot(c2, 2, true), false, "aborted by a corridor switch");
  assert.equal(acceptsSnapshot(c2, 2), true);
  assert.equal(acceptsSnapshot(c2, 2, false), true);
});

test("race from STG 27. 11.: corridor-1 answer lands after the switch to corridor 2", () => {
  // simulate the client: state = last accepted snapshot, label = current corridor
  let shown: 1 | 2 = 1;
  let state: Snap | null = null;
  const inFlight: { corridor: 1 | 2; aborted: boolean }[] = [];
  const request = () => {
    const r = { corridor: shown, aborted: false };
    inFlight.push(r);
    return r;
  };
  const answer = (r: { corridor: 1 | 2; aborted: boolean }, data: Snap) => {
    if (acceptsSnapshot(data, shown, r.aborted)) state = data;
  };
  const first = request(); // mount with the server default corridor 1
  shown = 2; // localStorage hydration / switch button
  first.aborted = true; // effect cleanup aborts the old poll
  const second = request();
  answer(second, c2);
  answer(first, c1); // late answer of the old request
  assert.deepEqual(snapshotForCorridor<Snap>(state as Snap | null, shown)?.runners, [861, 901]);
  // even without the abort (e.g. a flush-triggered fetch), the label wins
  state = c1;
  assert.equal(snapshotForCorridor<Snap>(state as Snap | null, shown), null);
});

test("countdown: clock under an hour, hours and minutes under a day, then the date", () => {
  const planned = Date.UTC(2026, 11, 6, 9, 15, 0);
  assert.deepEqual(prestartCountdown(299_000, planned), { kind: "clock", text: "−4:59" });
  assert.deepEqual(prestartCountdown(-3_000, planned), { kind: "clock", text: "+0:03" });
  assert.deepEqual(prestartCountdown(0, planned), { kind: "clock", text: "+0:00" });
  assert.deepEqual(prestartCountdown(3_599_400, planned), { kind: "clock", text: "−59:59" });
  assert.deepEqual(prestartCountdown(3_599_600, planned), {
    kind: "hours",
    hours: 1,
    minutes: 0,
    past: false,
  });
  assert.deepEqual(prestartCountdown((3 * 60 + 34) * 60_000 + 20_000, planned), {
    kind: "hours",
    hours: 3,
    minutes: 34,
    past: false,
  });
  assert.deepEqual(prestartCountdown(-2 * 3_600_000, planned), {
    kind: "hours",
    hours: 2,
    minutes: 0,
    past: true,
  });
  // STG: −214:47:07 → only the start date
  assert.deepEqual(prestartCountdown((214 * 3600 + 47 * 60 + 7) * 1000, planned), {
    kind: "date",
    at: planned,
  });
  assert.equal(prestartCountdown(24 * 3_600_000 - 500, planned).kind, "date");
  assert.equal(prestartCountdown(24 * 3_600_000 - 1_000, planned).kind, "hours");
});
