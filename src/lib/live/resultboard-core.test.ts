import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_RESULTBOARD_CONFIG,
  autoAssign,
  categoryCost,
  defaultMonitorFor,
  layoutColumns,
  monitorCategories,
  parseMonitorParam,
  parseResultboardConfig,
  partitionColumns,
  partnerGroups,
  shouldReload,
  stepScroll,
  type BoardPartner,
} from "./resultboard-core";

const CATS = [
  { id: "J", name: "žáci" },
  { id: "L", name: "dorostenci" },
  { id: "A", name: "muži" },
  { id: "B", name: "muži nad 40 let" },
  { id: "C", name: "muži nad 50 let" },
  { id: "K", name: "žákyně" },
  { id: "F", name: "ženy" },
  { id: "G", name: "ženy nad 40 let" },
];

test("parseResultboardConfig: výchozí hodnoty a ořezání", () => {
  assert.deepEqual(parseResultboardConfig(null), DEFAULT_RESULTBOARD_CONFIG);
  assert.deepEqual(parseResultboardConfig("{nejde"), DEFAULT_RESULTBOARD_CONFIG);
  const c = parseResultboardConfig(
    JSON.stringify({
      monitors: [{ name: "  Levá  ", columns: 4 }, { columns: 9 }, {}, {}, {}],
      order: ["A", "A", 3, "B"],
      assign: { A: 2, B: 7, C: 0, D: "1" },
      fixedTop: 40,
      scrollRowsPerS: "1,5",
      leader: { speaker: false, points: ["fin", "x"] },
      partners: { rotateS: 1, fixedId: 9 }, // fixedId ze starší verze se ignoruje (Q153)
    }),
  );
  assert.equal(c.monitors.length, 4);
  assert.deepEqual(c.monitors[0], { name: "Levá", columns: 4 });
  assert.deepEqual(c.monitors[1], { name: "Cíl – vpravo", columns: null });
  assert.deepEqual(c.order, ["A", "B"]);
  assert.deepEqual(c.assign, { A: 2, C: 0, D: 1 });
  assert.equal(c.fixedTop, 10);
  assert.equal(c.scrollRowsPerS, 1.5);
  assert.deepEqual(c.leader, { speaker: false, resultboard: true, points: ["fin"] });
  assert.deepEqual(c.partners, { show: true, rotateS: 3, qr: true });
});

test("výchozí rozdělení: veteráni na TV 2, ostatní TV 1", () => {
  assert.equal(defaultMonitorFor(CATS[2], 2), 1);
  assert.equal(defaultMonitorFor(CATS[3], 2), 2);
  assert.equal(defaultMonitorFor(CATS[3], 1), 1);
  const cfg = parseResultboardConfig({});
  assert.deepEqual(
    monitorCategories(cfg, CATS, 1).map((c) => c.id),
    ["J", "L", "A", "K", "F"],
  );
  assert.deepEqual(
    monitorCategories(cfg, CATS, 2).map((c) => c.id),
    ["B", "C", "G"],
  );
});

test("monitorCategories: pořadí, skrytí a TV mimo počet monitorů", () => {
  const cfg = parseResultboardConfig({
    monitors: [{}, {}],
    order: ["F", "A"],
    assign: { F: 1, A: 1, J: 0, L: 3 },
  });
  assert.deepEqual(
    monitorCategories(cfg, CATS, 1).map((c) => c.id),
    ["F", "A", "K"],
  );
  assert.equal(
    monitorCategories(cfg, CATS, 2).some((c) => c.id === "L"),
    false,
  );
});

test("partitionColumns: minimalizuje nejvyšší sloupec a vyrovnává", () => {
  assert.deepEqual(partitionColumns([], 5), []);
  assert.deepEqual(partitionColumns([10], 5), [[0, 1]]);
  assert.deepEqual(partitionColumns([5, 5, 5, 5], 2), [
    [0, 2],
    [2, 4],
  ]);
  // velká kategorie dostane sloupec sama
  assert.deepEqual(partitionColumns([40, 5, 5, 5, 5, 5], 3), [
    [0, 1],
    [1, 3],
    [3, 6],
  ]);
  // počet sloupců nepřekročí počet kategorií, pořadí zůstává
  const groups = partitionColumns([3, 9, 4, 8, 2, 7, 6], 5);
  assert.equal(groups.length, 5);
  assert.equal(groups[0][0], 0);
  assert.equal(groups.at(-1)?.[1], 7);
  for (let i = 1; i < groups.length; i += 1) assert.equal(groups[i][0], groups[i - 1][1]);
});

test("layoutColumns: výška kategorie = běžci + 3", () => {
  assert.equal(categoryCost(10), 13);
  const entries: Record<string, number> = { J: 30, L: 8, A: 60, K: 25, F: 20 };
  const cols = layoutColumns(
    CATS.filter((c) => c.id in entries),
    (c) => entries[c.id],
    3,
  );
  assert.deepEqual(
    cols.map((col) => col.map((c) => c.id)),
    [["J", "L"], ["A"], ["K", "F"]],
  );
});

test("autoAssign: vyrovná počty běžců, skryté nechá", () => {
  const entries = (c: { id: string }) => ({ J: 30, L: 10, A: 60, B: 40, C: 20 })[c.id] ?? 10;
  const assign = autoAssign(CATS, entries, 2, new Set(["K"]));
  assert.equal(assign.K, 0);
  const tv1 = CATS.filter((c) => assign[c.id] === 1).reduce((s, c) => s + entries(c), 0);
  const tv2 = CATS.filter((c) => assign[c.id] === 2).reduce((s, c) => s + entries(c), 0);
  assert.ok(Math.abs(tv1 - tv2) <= 40, `${tv1} vs ${tv2}`);
  assert.equal(assign.J, 1);
  assert.equal(assign.G, 2);
});

test("partnerGroups: generální partner pevně, ostatní ve skupinách po 5, poslední doplněná (Q153, Q214)", () => {
  const ps = (generalId: number | null): BoardPartner[] =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      name: `P${i + 1}`,
      category: i < 3 ? 1 : 2,
      logoSrc: null,
      href: null,
      general: i + 1 === generalId,
    }));
  const b = partnerGroups(ps(5));
  assert.equal(b.fixed?.id, 5);
  assert.deepEqual(
    b.groups.map((g) => g.length),
    [5, 5, 5],
  );
  // poslední skupina (P12) doplněná od začátku seznamu → lišta vždy plná
  assert.deepEqual(
    b.groups[2].map((p) => p.id),
    [12, 1, 2, 3, 4],
  );
  assert.equal(
    b.groups.flat().some((p) => p.id === 5),
    false,
  );
  // bez generálního partnera žádné pevné logo – střídají se všechna (ne „první v pořadí“)
  const c = partnerGroups(ps(null));
  assert.equal(c.fixed, null);
  assert.equal(c.groups.flat().length, 15);
  assert.deepEqual(
    c.groups
      .flat()
      .slice(0, 12)
      .map((p) => p.id),
    ps(null).map((p) => p.id),
  );
});

test("parseMonitorParam", () => {
  assert.equal(parseMonitorParam("1"), 1);
  assert.equal(parseMonitorParam("4"), 4);
  assert.equal(parseMonitorParam("5"), null);
  assert.equal(parseMonitorParam("01"), null);
  assert.equal(parseMonitorParam(undefined), null);
});

test("stepScroll: ping-pong s pauzou na koncích", () => {
  let st = { pos: 0, dir: 1 as 1 | -1, hold: 0 };
  st = stepScroll(st, 1, 100, 60, 6);
  assert.equal(st.pos, 60);
  st = stepScroll(st, 1, 100, 60, 6);
  assert.deepEqual(st, { pos: 100, dir: -1, hold: 6 });
  st = stepScroll(st, 5, 100, 60, 6);
  assert.equal(st.pos, 100);
  st = stepScroll(st, 1.5, 100, 60, 6);
  st = stepScroll(st, 1, 100, 60, 6);
  assert.equal(st.pos, 40);
  assert.equal(st.dir, -1);
  assert.deepEqual(stepScroll(st, 1, 0, 60, 6), { pos: 0, dir: 1, hold: 6 });
});

test("shouldReload: nová verze nebo po 6 h, nikdy bez spojení", () => {
  const base = { pageBuild: "1", serverBuild: "1", loadedMs: 0, nowMs: 1000, stale: false };
  assert.equal(shouldReload(base), false);
  assert.equal(shouldReload({ ...base, serverBuild: "2" }), true);
  assert.equal(shouldReload({ ...base, serverBuild: "2", stale: true }), false);
  assert.equal(shouldReload({ ...base, nowMs: 7 * 3600 * 1000 }), true);
});
