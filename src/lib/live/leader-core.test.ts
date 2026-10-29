import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LEADER_HOLD_MS,
  LEADER_PULSE_FIN_MS,
  LEADER_PULSE_SPLIT_MS,
  applyLeaderEvents,
  diffLeaders,
  emptyTracker,
  expireAlerts,
  leaderKey,
  leaderPassages,
  leadersOf,
  madeLeader,
  trackLeaders,
} from "./leader-core";
import type { PointKey, SpeakerRunner } from "./speaker-core";

const T0 = 1_800_000_000;
const ALL: PointKey[] = ["m1", "m2", "fin"];

function runner(
  bib: number,
  start: number,
  times: Partial<Pick<SpeakerRunner, "m1" | "m2" | "fin">> = {},
  cat = "A",
): SpeakerRunner {
  return {
    bib,
    name: `Běžec ${bib}`,
    cat,
    start: T0 + start,
    m1: times.m1 ?? null,
    m2: times.m2 ?? null,
    fin: times.fin ?? null,
  };
}

test("leadersOf: nejlepší čas na bodu, shoda → kdo proběhl dřív", () => {
  const map = leadersOf([
    runner(1, 0, { m1: 300, fin: 900 }),
    runner(2, 30, { m1: 290 }),
    runner(3, 60, { m1: 290 }),
    runner(4, 0, { m1: 280 }, "B"),
  ]);
  assert.equal(map.get(leaderKey("A", "m1"))?.bib, 2);
  assert.equal(map.get(leaderKey("A", "fin"))?.bib, 1);
  assert.equal(map.get(leaderKey("A", "m2")), undefined);
  assert.equal(map.get(leaderKey("B", "m1"))?.bib, 4);
  assert.equal(map.get(leaderKey("B", "m1"))?.at, T0 + 280);
});

test("leadersOf: jen sledované body", () => {
  const map = leadersOf([runner(1, 0, { m1: 300, fin: 900 })], ["fin"]);
  assert.equal(map.size, 1);
  assert.ok(map.has(leaderKey("A", "fin")));
});

test("diffLeaders: první snímek nic nehlásí", () => {
  const next = leadersOf([runner(1, 0, { fin: 900 })]);
  assert.deepEqual(diffLeaders(null, next, T0 + 900), []);
});

test("diffLeaders: první na bodu, nový lídr, beze změny a smazaný čas", () => {
  const a = leadersOf([runner(1, 0, { m1: 300 })]);
  const b = leadersOf([runner(1, 0, { m1: 300, fin: 900 }), runner(2, 30, { m1: 290 })]);
  const ev = diffLeaders(a, b, T0 + 900);
  assert.equal(ev.length, 2);
  const m1 = ev.find((e) => e.point === "m1");
  assert.equal(m1?.leader.bib, 2);
  assert.equal(m1?.previous?.bib, 1);
  assert.equal(m1?.previous?.time, 300);
  const fin = ev.find((e) => e.point === "fin");
  assert.equal(fin?.previous, null);
  assert.equal(fin?.late, false);
  // stejný lídr → nic
  assert.deepEqual(diffLeaders(b, b, T0 + 901), []);
  // smazaný čas lídra: nastoupí původní → událost; úplné zmizení → nic
  const back = diffLeaders(b, a, T0 + 950).map((e) => [e.point, e.leader.bib]);
  assert.deepEqual(back, [["m1", 1]]);
  assert.deepEqual(diffLeaders(a, leadersOf([]), T0 + 950), []);
});

test("diffLeaders: dodatečně zapsaný čas je označený", () => {
  const a = leadersOf([runner(1, 0, { fin: 900 })]);
  const b = leadersOf([runner(1, 0, { fin: 900 }), runner(2, 0, { fin: 880 })]);
  const [ev] = diffLeaders(a, b, T0 + 880 + 61);
  assert.equal(ev.late, true);
  const [fresh] = diffLeaders(a, b, T0 + 880 + 5);
  assert.equal(fresh.late, false);
});

test("trackLeaders: výchozí stav, události, mezera a hromadná změna", () => {
  const ms = (s: number) => (T0 + s) * 1000;
  let t = emptyTracker();
  let r = trackLeaders(t, [runner(1, 0, { fin: 900 })], ms(1000), ALL);
  assert.equal(r.events.length, 0, "první snímek nebliká");
  t = r.tracker;

  r = trackLeaders(t, [runner(1, 0, { fin: 900 }), runner(2, 0, { fin: 850 })], ms(1005), ALL);
  assert.equal(r.events.length, 1);
  assert.equal(r.tracker.alerts.get("A")?.bib, 2);
  t = r.tracker;

  // po výpadku (> 60 s bez snímku) jen nový výchozí stav
  r = trackLeaders(t, [runner(3, 0, { fin: 800 })], ms(1100), ALL);
  assert.equal(r.events.length, 0);
  t = r.tracker;

  // hromadný import (víc než 6 událostí naráz) nebliká
  const many = "BCDEFGH".split("").map((cat, i) => runner(10 + i, 0, { fin: 900 }, cat));
  r = trackLeaders(t, [runner(3, 0, { fin: 800 }), ...many], ms(1105), ALL);
  assert.equal(r.events.length, 0);
  assert.equal(r.tracker.leaders?.size, 8);
});

test("applyLeaderEvents: časy, priorita cíle a restart animace", () => {
  const ev = (point: PointKey, bib: number) => ({
    cat: "A",
    point,
    leader: { bib, name: `B${bib}`, time: 100, at: T0 },
    previous: null,
    late: false,
  });
  let { alerts, seq } = applyLeaderEvents(new Map(), [ev("fin", 1)], 1000, 0);
  let a = alerts.get("A")!;
  assert.equal(a.point, "fin");
  assert.equal(a.pulseUntil, 1000 + LEADER_PULSE_FIN_MS);
  assert.equal(a.until, 1000 + LEADER_HOLD_MS);
  assert.equal(seq, 1);

  // M1 během cíle: animaci nepřeruší, jen přidá řádek
  ({ alerts, seq } = applyLeaderEvents(alerts, [ev("m1", 5)], 3000, seq));
  a = alerts.get("A")!;
  assert.equal(a.point, "fin");
  assert.equal(a.seq, 1);
  assert.deepEqual(
    a.lines.map((l) => l.point),
    ["fin", "m1"],
  );
  assert.equal(a.until, 3000 + LEADER_HOLD_MS);

  // další cíl: animace znovu (nový seq), řádek M1 zůstane pod ním
  ({ alerts, seq } = applyLeaderEvents(alerts, [ev("fin", 7)], 4000, seq));
  a = alerts.get("A")!;
  assert.equal(a.seq, 2);
  assert.equal(a.bib, 7);
  assert.deepEqual(
    a.lines.map((l) => [l.point, l.leader.bib]),
    [
      ["fin", 7],
      ["m1", 5],
    ],
  );

  // mezičas sám: slabší a kratší pulz
  const split = applyLeaderEvents(new Map(), [ev("m2", 3)], 0, 0).alerts.get("A")!;
  assert.equal(split.pulseUntil, LEADER_PULSE_SPLIT_MS);

  // v jednom snímku vyhrává cíl
  const both = applyLeaderEvents(new Map(), [ev("m1", 2), ev("fin", 4)], 0, 0).alerts.get("A")!;
  assert.equal(both.point, "fin");
  assert.equal(both.lines.length, 2);

  assert.equal(expireAlerts(alerts, 4000 + LEADER_HOLD_MS).size, 0);
  assert.equal(expireAlerts(alerts, 4000 + LEADER_HOLD_MS - 1).size, 1);
});

test("madeLeader / leaderPassages: ★ u průchodů, které udělaly lídra", () => {
  const rs = [
    runner(1, 0, { m1: 300 }), // první na M1 → lídr
    runner(2, 60, { m1: 320 }), // pomalejší → ne
    runner(3, 120, { m1: 290 }), // rychlejší → lídr
    runner(4, 120, { m1: 300 }, "B"),
  ];
  const p = (r: SpeakerRunner) => ({
    runner: r,
    point: "m1" as const,
    at: r.start + r.m1!,
    time: r.m1!,
  });
  assert.equal(madeLeader(p(rs[0]), rs.slice(0, 3)), true);
  assert.equal(madeLeader(p(rs[1]), rs.slice(0, 3)), false);
  assert.equal(madeLeader(p(rs[2]), rs.slice(0, 3)), true);
  const stars = leaderPassages(rs.map(p), rs);
  assert.deepEqual([...stars].sort(), ["1|m1", "3|m1", "4|m1"]);
});
