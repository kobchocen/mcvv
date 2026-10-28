import assert from "node:assert/strict";
import { test } from "node:test";

import {
  beats,
  buildSearchIndex,
  categoryState,
  combinedOrder,
  formatMinutes,
  highlightRanges,
  isFinalFinish,
  normalizeSearch,
  rankAt,
  recentHit,
  recentPassages,
  runnerStatus,
  searchRunners,
  virtualRank,
  type SpeakerRunner,
} from "./speaker-core";

const T0 = 1_800_000_000; // libovolná epocha (s)

function runner(
  bib: number,
  start: number,
  times: Partial<Pick<SpeakerRunner, "m1" | "m2" | "fin">> = {},
  name = `Běžec ${bib}`,
  cat = "A",
): SpeakerRunner {
  return {
    bib,
    name,
    cat,
    start: T0 + start,
    m1: times.m1 ?? null,
    m2: times.m2 ?? null,
    fin: times.fin ?? null,
  };
}

const bibs = (list: readonly SpeakerRunner[]) => list.map((r) => r.bib);

// Výřez z mockupu v4 (muži, „teď“ = 42397 s od půlnoci, starty po 15 s).
const now = T0 + 42397;
const muzi = [
  runner(301, 41400, { m1: 326, m2: 638, fin: 905 }, "Malý Vojtěch"),
  runner(302, 41415, { m1: 330, m2: 647, fin: 918 }, "Urban Jiří"),
  runner(303, 41430, { m1: 356, m2: 698 }, "Toman Petr"),
  runner(304, 41445, { m1: 339, m2: 664, fin: 942 }, "Sedláček Aleš"),
  runner(306, 41475, { m1: 324, m2: 634, fin: 900 }, "Blažek Marek"),
  runner(320, 41685, { m1: 300, m2: 642 }, "Král Jiří"),
  runner(325, 41760, { m1: 318, m2: 618 }, "Svoboda Jakub"),
  runner(343, 42030, { m1: 337 }, "Kučera Vojtěch"),
  runner(338, 41955, {}, "Mašek Michal"),
  runner(375, 42510, {}, "Procházka Aleš"),
];

test("Svoboda (M2 618) goes above all finishers – compared at M2, live 10:37 < 15:00", () => {
  const order = combinedOrder(
    muzi.filter((r) => r.m1 != null),
    now,
  );
  assert.equal(order[0].bib, 325);
  // doběhlí zůstávají mezi sebou podle cílového času
  const finishers = bibs(order.filter((r) => r.fin != null));
  assert.deepEqual(finishers, [306, 301, 302, 304]);
});

test("finisher vs M2 runner by M2, M2 vs M1 runner by M1, tie keeps the one further along", () => {
  const fin = runner(1, 0, { m1: 300, m2: 600, fin: 900 });
  const m2 = runner(2, 0, { m1: 290, m2: 600 });
  const m1 = runner(3, 0, { m1: 290 });
  const at = T0 + 550;
  assert.equal(beats(m2, fin, at), false, "tie at M2 → finisher stays above");
  assert.equal(beats(m1, m2, at), false, "tie at M1 → M2 runner stays above");
  const faster = runner(4, 0, { m1: 280 });
  assert.equal(beats(faster, m2, at), true);
  // M1 290 < 300 → bib 3 jde i nad cílaře (porovnání na M1)
  assert.deepEqual(bibs(combinedOrder([m1, m2, fin, faster], at)), [4, 3, 1, 2]);
});

test("add-on: on-course runner whose live time exceeds the other's furthest time goes below", () => {
  const a = runner(1, 0, { m1: 400, m2: 700, fin: 900 });
  const b = runner(2, 0, { m1: 380, m2: 650 });
  assert.deepEqual(bibs(combinedOrder([a, b], T0 + 899)), [2, 1]);
  assert.deepEqual(bibs(combinedOrder([a, b], T0 + 900)), [2, 1], "900 is not more than 900");
  assert.deepEqual(bibs(combinedOrder([a, b], T0 + 901)), [1, 2]);
});

test("non-transitive cycle is resolved deterministically level by level", () => {
  // A v cíli > C na M1 (400 < 420), C > B na M1 (420 < 450), B > A na M2 (650 < 700)
  const A = runner(10, 0, { m1: 400, m2: 700, fin: 900 });
  const B = runner(20, 0, { m1: 450, m2: 650 });
  const C = runner(30, 100, { m1: 420 }); // živý čas 600 ≤ 650 → B ještě může dohnat
  const at = T0 + 700;
  assert.equal(beats(B, A, at), true);
  assert.equal(beats(C, B, at), true);
  assert.equal(beats(C, A, at), false);
  const expected = [30, 20, 10];
  for (const input of [
    [A, B, C],
    [C, B, A],
    [B, A, C],
    [C, A, B],
  ]) {
    assert.deepEqual(bibs(combinedOrder(input, at)), expected);
  }
});

test("runner with a missed split is compared only where both have a time", () => {
  const finNoM2 = runner(1, 0, { m1: 300, fin: 900 });
  const m2 = runner(2, 0, { m1: 310, m2: 600 });
  // společný bod M2 – cílař tam záznam nemá → zůstává výš (je dál)
  assert.equal(beats(m2, finNoM2, T0 + 620), false);
  assert.deepEqual(bibs(combinedOrder([m2, finNoM2], T0 + 620)), [1, 2]);
});

test("final ✓: every unfinished runner (incl. no record and not started) must be past the time", () => {
  const fin = 900;
  const ok = [runner(1, 0, { m1: 300 }), runner(2, 0)];
  assert.equal(isFinalFinish(fin, ok, T0 + 901), true);
  assert.equal(isFinalFinish(fin, ok, T0 + 900), false, "strictly greater");
  // běžec bez záznamu, který startuje později → blokuje
  assert.equal(isFinalFinish(fin, [...ok, runner(3, 600)], T0 + 901), false);
  // start v budoucnosti blokuje vždy
  assert.equal(isFinalFinish(fin, [runner(4, 5000)], T0 + 1000), false);
  assert.equal(isFinalFinish(fin, [], T0), true);
});

test("category state: ranks only for finishers, ✓ and KONEČNÉ", () => {
  const rs = [
    runner(1, 0, { m1: 300, m2: 600, fin: 900 }),
    runner(2, 15, { m1: 310, m2: 620, fin: 950 }),
    runner(3, 30, { m1: 290, m2: 590 }),
    runner(4, 45),
  ];
  let s = categoryState(rs, T0 + 700);
  assert.deepEqual(bibs(s.shown.map((r) => r.runner)), [3, 1, 2]);
  assert.deepEqual(
    s.shown.map((r) => r.rank),
    [null, 1, 2],
  );
  assert.equal(s.finished, 2);
  assert.equal(s.onCourse, 1);
  assert.equal(s.shown[1].final, false);
  assert.equal(s.done, false);
  // všichni nedoběhlí už běží déle než 950 → oba doběhlí konečně, ale seznam < TOP
  // a nedoběhlí zbývají → kategorie není konečná
  s = categoryState(rs, T0 + 45 + 951);
  assert.equal(s.shown.find((r) => r.runner.bib === 1)?.final, true);
  assert.equal(s.shown.find((r) => r.runner.bib === 2)?.final, true);
  assert.equal(s.done, false);
  // všichni doběhli → konečné
  const all = [runner(1, 0, { fin: 900 }), runner(2, 15, { fin: 950 })];
  assert.equal(categoryState(all, T0 + 2000).done, true);
  // nikdo se záznamem → ne
  assert.equal(categoryState([runner(1, 0)], T0 + 5000).done, false);
});

test("category is final when the whole shown top N is final even with runners left", () => {
  const rs = [
    ...Array.from({ length: 3 }, (_, i) => runner(i + 1, i * 15, { fin: 800 + i })),
    runner(9, 0, { m1: 500 }),
  ];
  assert.equal(categoryState(rs, T0 + 900, 3).done, true);
  assert.equal(categoryState(rs, T0 + 801, 3).done, false, "runner 9 could still beat 802");
});

test("equal finish times share the rank", () => {
  const rs = [runner(1, 0, { fin: 900 }), runner(2, 15, { fin: 900 }), runner(3, 30, { fin: 950 })];
  assert.deepEqual(
    categoryState(rs, T0 + 2000).shown.map((r) => r.rank),
    [1, 1, 3],
  );
});

test("virtual rank among finishers ticks with live time", () => {
  assert.equal(virtualRank([900, 905, 918], 899), 1);
  assert.equal(virtualRank([900, 905, 918], 910), 3);
  assert.equal(virtualRank([], 2000), 1);
  const rs = [runner(1, 0, { fin: 900 }), runner(2, 0, { fin: 905 }), runner(3, 0, { m1: 300 })];
  const a = runnerStatus(rs[2], rs, T0 + 850);
  const b = runnerStatus(rs[2], rs, T0 + 903);
  assert.equal(a.kind, "on-course");
  assert.equal(a.kind === "on-course" && a.virtualRank, 1);
  assert.equal(b.kind === "on-course" && b.virtualRank, 2);
  assert.equal(b.kind === "on-course" && b.last?.rank, 1);
});

test("runner status: finished (provisional / final) and before start", () => {
  const rs = [runner(1, 0, { fin: 900 }), runner(2, 1000)];
  const s = runnerStatus(rs[0], rs, T0 + 950);
  assert.deepEqual(s, { kind: "finished", time: 900, rank: 1, final: false });
  const ns = runnerStatus(rs[1], rs, T0 + 950);
  assert.deepEqual(ns, { kind: "before-start", start: T0 + 1000, inS: 50 });
  const f = runnerStatus(rs[0], rs, T0 + 1000 + 901);
  assert.equal(f.kind === "finished" && f.final, true);
});

test("rank at a point and recent passages", () => {
  assert.equal(rankAt(muzi, "m2", 618), 1);
  assert.equal(rankAt(muzi, "m1", 318), 2);
  const recent = recentPassages(muzi, now, 3);
  assert.equal(recent.length, 3);
  assert.ok(recent[0].at >= recent[1].at && recent[1].at >= recent[2].at);
  assert.ok(recent.every((p) => p.at <= now));
  assert.equal(recentHit(runner(1, 0, { m1: 100 }), T0 + 160), true);
  assert.equal(recentHit(runner(1, 0, { m1: 100 }), T0 + 161), false);
});

test("search: case and diacritics insensitive, bib prefix, runners without record", () => {
  assert.equal(normalizeSearch("Šťastný ČERMÁK"), "stastny cermak");
  const idx = buildSearchIndex(muzi);
  assert.deepEqual(bibs(searchRunners(idx, "svob")), [325]);
  assert.deepEqual(bibs(searchRunners(idx, "SEDLACEK")), [304]);
  assert.deepEqual(bibs(searchRunners(idx, "kucera voj")), [343]);
  assert.deepEqual(bibs(searchRunners(idx, "mašek")), [338], "no record, still searchable");
  const prefixed = searchRunners(idx, "30");
  assert.equal(prefixed.length, 5);
  assert.ok(prefixed.every((r) => String(r.bib).startsWith("30")));
  assert.equal(searchRunners(idx, "302")[0].bib, 302);
  assert.deepEqual(searchRunners(idx, "   "), []);
  assert.deepEqual(
    highlightRanges("Šťastný", "stast").map((m) => (m ? 1 : 0)),
    [1, 1, 1, 1, 1, 0, 0],
  );
});

test("formatMinutes", () => {
  assert.equal(formatMinutes(618), "10:18");
  assert.equal(formatMinutes(5), "0:05");
});
