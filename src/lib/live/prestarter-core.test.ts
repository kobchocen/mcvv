import assert from "node:assert/strict";
import { test } from "node:test";

import { hasPrestarterRole, hasStartCorridorRole, prestarterAccessFor } from "./prestarter-core";
import {
  buildStarterView,
  decideStarterWrite,
  isDeviceSource,
  mergePending,
  plannedStartMs,
  PRESTARTER_QUEUE_SIZE,
  PRESTARTER_SOURCE,
  publicLateOffset,
  QUEUE_SIZE,
  sourceRank,
  type StarterMark,
  type StarterRunner,
} from "./starter-core";

const ZERO = Date.UTC(2026, 11, 6, 9, 15, 0);
const runner = (bib: number): StarterRunner => ({
  bib,
  name: `Běžec ${bib}`,
  club: null,
  plannedMs: plannedStartMs(ZERO, bib, 15, 601),
});
const settings = { redPhaseS: 5, dnsWindowS: 300, intervalS: 15 };

test("prestarter role: primary column or grant, v1 and v2", () => {
  assert.equal(hasPrestarterRole("prestarter"), true);
  assert.equal(hasPrestarterRole("prestarter", []), true);
  assert.equal(hasPrestarterRole("starter", ["starter", "prestarter"]), true);
  assert.equal(hasPrestarterRole("registrar", ["prestarter"]), true);
  assert.equal(hasPrestarterRole("starter", ["starter"]), false);
  assert.equal(hasPrestarterRole("admin"), false);
});

test("corridor is assigned to starters and pre-starters (column or grant)", () => {
  assert.equal(hasStartCorridorRole("starter"), true);
  assert.equal(hasStartCorridorRole("prestarter"), true);
  assert.equal(hasStartCorridorRole("splitmaker", ["splitmaker", "prestarter"]), true);
  assert.equal(hasStartCorridorRole("registrar", ["starter"]), true);
  assert.equal(hasStartCorridorRole("splitmaker", ["splitmaker"]), false);
  assert.equal(hasStartCorridorRole("organizer"), false);
});

test("access: pre-starter only own corridor, start control switches; writes stay in view", () => {
  const own = { any: false, own: true };
  assert.deepEqual(prestarterAccessFor(own, 2, "1"), {
    ok: true,
    corridor: 2,
    allowed: 2,
    canSwitch: false,
  });
  assert.deepEqual(prestarterAccessFor(own, null, "1"), { ok: false, error: "no-corridor" });
  const any = { any: true, own: false };
  assert.deepEqual(prestarterAccessFor(any, null, "2"), {
    ok: true,
    corridor: 2,
    allowed: 2,
    canSwitch: true,
  });
  assert.deepEqual(prestarterAccessFor(any, 2, null), {
    ok: true,
    corridor: 2,
    allowed: 2,
    canSwitch: true,
  });
  assert.deepEqual(prestarterAccessFor(any, null, "x"), {
    ok: true,
    corridor: 1,
    allowed: 1,
    canSwitch: true,
  });
  assert.deepEqual(prestarterAccessFor({ any: false, own: false }, 1, "1"), {
    ok: false,
    error: "forbidden",
  });
});

test("pre-starter queue has 6 rows, the starter keeps 4", () => {
  const runners = Array.from({ length: 12 }, (_, i) => runner(i + 1));
  const now = ZERO - 60_000;
  const starter = buildStarterView(runners, new Map(), now, settings);
  const pre = buildStarterView(runners, new Map(), now, {
    ...settings,
    queueSize: PRESTARTER_QUEUE_SIZE,
  });
  assert.equal(QUEUE_SIZE, 4);
  assert.equal(PRESTARTER_QUEUE_SIZE, 6);
  assert.equal(starter.queue.length, 4);
  assert.deepEqual(
    pre.queue.map((row) => row.bib),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(pre.counts.toStart, 12);
});

test("marked by pre-starter disappears at start; unmarked falls to Neodstartovali", () => {
  const runners = [runner(1), runner(2)];
  const marks = new Map<number, StarterMark>([
    [1, { bib: 1, source: PRESTARTER_SOURCE, markedAt: ZERO - 10_000, late: false }],
  ]);
  const view = buildStarterView(runners, marks, ZERO + 15_000 + 6_000, {
    ...settings,
    queueSize: PRESTARTER_QUEUE_SIZE,
  });
  assert.deepEqual(view.queue, []);
  assert.deepEqual(
    view.missing.map((row) => row.bib),
    [2],
  );
  assert.equal(view.counts.missing, 1);
});

test("pre-starter and starter share priority: later tap wins, admin always wins", () => {
  assert.equal(sourceRank(PRESTARTER_SOURCE), sourceRank("starter"));
  assert.equal(isDeviceSource("prestart"), true);
  assert.equal(isDeviceSource("starter"), true);
  assert.equal(isDeviceSource("web"), false);
  const at = (s: number) => new Date(ZERO + s * 1000);
  const byStarter = { source: "starter", markedAt: at(10) };
  const byPre = { source: PRESTARTER_SOURCE, markedAt: at(10) };
  assert.equal(decideStarterWrite(byStarter, "mark", at(11)), "update");
  assert.equal(decideStarterWrite(byStarter, "mark", at(9)), "ignored");
  assert.equal(decideStarterWrite(byPre, "unmark", at(11)), "delete");
  assert.equal(decideStarterWrite(byStarter, "unmark", at(11)), "delete");
  assert.equal(decideStarterWrite(byPre, "unmark", at(9)), "ignored");
  assert.equal(decideStarterWrite({ source: "admin", markedAt: null }, "mark", at(20)), "ignored");
  assert.equal(decideStarterWrite({ source: "split", markedAt: null }, "late", at(20)), "update");
});

test("optimistic marks of the pre-starter device carry its source", () => {
  const merged = mergePending(
    new Map(),
    [{ id: "a1b2c3d4", bib: 3, action: "mark", at: ZERO - 1000 }],
    (bib) => runner(bib).plannedMs,
    15,
    PRESTARTER_SOURCE,
  );
  assert.equal(merged.get(3)?.source, PRESTARTER_SOURCE);
  const starter = mergePending(
    new Map(),
    [{ id: "a1b2c3d5", bib: 3, action: "mark", at: ZERO - 1000 }],
    (bib) => runner(bib).plannedMs,
    15,
  );
  assert.equal(starter.get(3)?.source, "starter");
});

test("online results show a late start of the pre-starter like the starter's", () => {
  assert.equal(publicLateOffset({ source: PRESTARTER_SOURCE, late: true }, 42, 15), 42);
  assert.equal(publicLateOffset({ source: PRESTARTER_SOURCE, late: false }, 42, 15), null);
  assert.equal(publicLateOffset({ source: "starter", late: true }, 42, 15), 42);
});
