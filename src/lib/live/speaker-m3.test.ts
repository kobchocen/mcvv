import assert from "node:assert/strict";
import { test } from "node:test";

import { followEvents, followSignature, type FollowSnap } from "./follow-core";
import { leadersOf } from "./leader-core";
import { decodeOnline, encodeOnline, gateOnline, type OnlineSnapshot } from "./online-results-core";
import { parseResultboardConfig } from "./resultboard-core";
import {
  combinedOrder,
  lastPoint,
  nextPoint,
  pointsFor,
  POINTS,
  recentPassages,
  runnerStatus,
  type SpeakerRunner,
} from "./speaker-core";

// #316: až tři veřejné mezičasy (M1–M3) na živých výsledcích, tabuli a speakeru

const T0 = 1_800_000_000;
const r3 = (
  bib: number,
  t: { m1?: number; m2?: number; m3?: number; fin?: number } = {},
): SpeakerRunner => ({
  bib,
  name: `B${bib}`,
  cat: "A",
  start: T0,
  m1: t.m1 ?? null,
  m2: t.m2 ?? null,
  m3: t.m3 ?? null,
  fin: t.fin ?? null,
});

test("pointsFor: počet veřejných mezičasů → aktivní body, výchozí dva", () => {
  assert.deepEqual(pointsFor(undefined), POINTS);
  assert.deepEqual(pointsFor(0), ["fin"]);
  assert.deepEqual(pointsFor(1), ["m1", "fin"]);
  assert.deepEqual(pointsFor(2), ["m1", "m2", "fin"]);
  assert.deepEqual(pointsFor(3), ["m1", "m2", "m3", "fin"]);
  assert.deepEqual(pointsFor(7), ["m1", "m2", "m3", "fin"]);
});

test("nextPoint / lastPoint s M3", () => {
  const p3 = pointsFor(3);
  assert.equal(nextPoint(r3(1), p3), "m1");
  assert.equal(nextPoint(r3(1, { m1: 100 }), p3), "m2");
  assert.equal(nextPoint(r3(1, { m1: 100, m2: 200 }), p3), "m3");
  assert.equal(nextPoint(r3(1, { m1: 100, m2: 200 })), "fin"); // výchozí dva body
  assert.equal(nextPoint(r3(1, { m3: 300 }), p3), "fin");
  assert.equal(nextPoint(r3(1, { fin: 400 }), p3), null);
  assert.equal(nextPoint(r3(1), pointsFor(0)), "fin");
  assert.equal(lastPoint(r3(1, { m1: 100, m3: 300 })), "m3");
});

test("combinedOrder: běžec na M3 jde pod doběhlé a nad běžce na M2", () => {
  const now = T0 + 1000;
  const list = [
    r3(1, { m1: 100, m2: 200 }),
    r3(2, { m1: 90, m2: 190, m3: 280 }),
    r3(3, { fin: 900 }),
  ];
  assert.deepEqual(
    combinedOrder(list, now).map((r) => r.bib),
    [3, 2, 1],
  );
  // živý 285 s < cíl 300 → rozhoduje M3 (280 < 290), rychlejší na M3 jde nahoru;
  // po překročení cílového času soupeře už zůstává pod ním
  const fast = [r3(3, { m1: 95, m2: 195, m3: 290, fin: 300 }), r3(2, { m1: 90, m2: 190, m3: 280 })];
  assert.deepEqual(
    combinedOrder(fast, T0 + 285).map((r) => r.bib),
    [2, 3],
  );
  assert.deepEqual(
    combinedOrder(fast, now).map((r) => r.bib),
    [3, 2],
  );
});

test("runnerStatus / recentPassages znají M3", () => {
  const now = T0 + 400;
  const a = r3(1, { m1: 100, m2: 200, m3: 300 });
  const st = runnerStatus(a, [a], now, pointsFor(3));
  assert.equal(st.kind, "on-course");
  if (st.kind === "on-course") {
    assert.equal(st.next, "fin");
    assert.equal(st.last?.point, "m3");
  }
  const st2 = runnerStatus(r3(2, { m1: 100, m2: 200 }), [a], now, pointsFor(3));
  if (st2.kind === "on-course") assert.equal(st2.next, "m3");
  assert.ok(recentPassages([a], now, 600).some((p) => p.point === "m3"));
});

test("drát online výsledků: M3 na konci n-tice, bez M3 beze změny", () => {
  const base = {
    year: 2026,
    dnsGraceS: 300,
    categories: [{ id: "A", name: "muži", sex: "M", slug: "muzi", short: "Muži" }],
    tr: [],
    clubs: [],
  };
  const runner = {
    bib: 1,
    name: "X",
    cat: "A",
    start: 1000,
    m1: 300,
    m2: 600,
    fin: null,
    started: true,
    late: null,
    club: null,
  };
  const two: OnlineSnapshot = { ...base, runners: [runner] };
  assert.equal(encodeOnline(two).r[0].length, 10);
  assert.deepEqual(decodeOnline(JSON.parse(JSON.stringify(encodeOnline(two)))), two);
  const three: OnlineSnapshot = {
    ...base,
    runners: [{ ...runner, m3: 900 }],
    pts: ["1,3 km", "2,0 km", "2,7 km"],
    pp: [13, 20, 27],
  };
  const wire = encodeOnline(three);
  assert.equal(wire.r[0][10], 900);
  assert.deepEqual(decodeOnline(JSON.parse(JSON.stringify(wire))), three);
  // mimo okno živých výsledků se maže i M3
  assert.equal(gateOnline(three, "closed").runners[0].m3, null);
  assert.equal("m3" in gateOnline(two, "closed").runners[0], false);
});

test("sledovaní a lídr hlásí i M3", () => {
  const snap = (m3: number | null): FollowSnap => ({ m1: 1, m2: 2, m3, fin: null, final: false });
  const prev = new Map([[1, snap(null)]]);
  const next = new Map([[1, snap(3)]]);
  assert.notEqual(followSignature(prev), followSignature(next));
  assert.deepEqual(followEvents(prev, next), [{ kind: "split", bib: 1, point: "m3" }]);
  const leaders = leadersOf([r3(1, { m3: 300 }), r3(2, { m3: 290 })]);
  assert.equal(leaders.get("A|m3")?.bib, 2);
});

test("nastavení tabule: lídr na M3 se dá zapnout", () => {
  const cfg = parseResultboardConfig({ leader: { points: ["m3", "fin", "zz"] } });
  assert.deepEqual(cfg.leader.points, ["m3", "fin"]);
});
