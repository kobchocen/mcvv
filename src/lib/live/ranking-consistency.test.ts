/**
 * Q155: speaker, online výsledky (`/vysledky/online`) i resultboard řadí běžce s časy
 * stejně – jedna funkce `combinedOrder` (speaker-core). Kdo má jen M1 a ten je lepší než
 * M1 vedoucího v cíli, je nad ním (dokud ho ještě může porazit). t555u: jakmile živý čas
 * běžce přesáhne skutečný čas soupeře na kterémkoli dalším bodu (M2 i cíl), je pod ním. Pod výsledky zůstávají
 * skupiny odstartovaní bez mezičasu → čekající na start → DNS.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_DNS_GRACE_S, onlineCategoryState, type OnlineRunner } from "./online-results-core";
import { boardItems, DEFAULT_RESULTBOARD_CONFIG } from "./resultboard-core";
import { categoryState } from "./speaker-core";

const T0 = 1_800_000_000;
const GRACE = DEFAULT_DNS_GRACE_S;

function runner(
  bib: number,
  start: number,
  times: Partial<Pick<OnlineRunner, "m1" | "m2" | "fin" | "started">> = {},
): OnlineRunner {
  return {
    bib,
    name: `Běžec ${bib}`,
    cat: "A",
    start: T0 + start,
    m1: times.m1 ?? null,
    m2: times.m2 ?? null,
    fin: times.fin ?? null,
    started: times.started ?? false,
    late: null,
  };
}

/** Pořadí čísel ve všech třech výstupech (speaker, online, resultboard). */
function orders(list: OnlineRunner[], now: number) {
  const speaker = categoryState(list, now).shown.map((r) => r.runner.bib);
  const state = onlineCategoryState(list, now, GRACE);
  const online = state.rows.map((r) => r.runner.bib);
  const board = boardItems(state, DEFAULT_RESULTBOARD_CONFIG)
    .filter((it) => it.kind === "res")
    .map((it) => (it.kind === "res" ? it.row.runner.bib : 0));
  return { speaker, online, board, state };
}

// vedoucí v cíli: M1 320, cíl 900 (start v 0)
const leader = runner(1, 0, { m1: 320, m2: 610, fin: 900 });
const second = runner(2, 15, { m1: 330, m2: 640, fin: 950 });

test("Q155: jen M1 lepší než M1 vedoucího v cíli → nad ním ve všech výstupech", () => {
  const m1Only = runner(9, 600, { m1: 310 }); // teď 1000 → živý čas 400 s < 900 s
  const now = T0 + 1000;
  const o = orders([leader, second, m1Only], now);
  assert.deepEqual(o.speaker, [9, 1, 2]);
  assert.deepEqual(o.online, o.speaker);
  assert.deepEqual(o.board, o.speaker);
  // běžec na trati nemá pořadí, vedoucí v cíli si nechává 1. místo mezi doběhlými
  assert.equal(o.state.rows[0].rank, null);
  assert.equal(o.state.rows[1].rank, 1);
});

test("Q155: jen M1 horší než vedoucí, ale lepší než druhý → mezi ně", () => {
  const m1Only = runner(9, 600, { m1: 325 });
  const o = orders([leader, second, m1Only], T0 + 1000);
  assert.deepEqual(o.speaker, [1, 9, 2]);
  assert.deepEqual(o.online, o.speaker);
  assert.deepEqual(o.board, o.speaker);
});

test("Q155: jen M1 lepší, ale živý čas už přesáhl M2 vedoucího i druhého → pod oba", () => {
  const m1Only = runner(9, 0, { m1: 310 }); // teď 620 → živý čas 620 s > M2 vedoucího 610 s
  let o = orders([leader, second, m1Only], T0 + 620);
  assert.deepEqual(o.speaker, [1, 9, 2]); // druhého (M2 640) ještě porazit může
  assert.deepEqual(o.online, o.speaker);
  assert.deepEqual(o.board, o.speaker);
  o = orders([leader, second, m1Only], T0 + 641); // 641 > 640 → i pod druhého
  assert.deepEqual(o.speaker, [1, 2, 9]);
  assert.deepEqual(o.online, o.speaker);
  assert.deepEqual(o.board, o.speaker);
});

// t555u – výřez ze speakeru (muži): Bukvice Filip M1 4:42, M2 9:07, cíl 13:33
const at = (m: number, sec: number) => m * 60 + sec;
const NOW = T0 + 10_000;
/** Běžec s živým časem `live` s v okamžiku NOW. */
const live = (bib: number, l: number, times: Parameters<typeof runner>[2]) =>
  runner(bib, 10_000 - l, times);
const bukviceF = live(227, at(20, 0), { m1: at(4, 42), m2: at(9, 7), fin: at(13, 33) });
const bukviceV = live(235, at(12, 5), { m1: at(4, 31), m2: at(8, 43) });
const doubekR = live(254, at(7, 20), { m1: at(4, 29) });
const siska = live(253, at(7, 35), { m1: at(4, 40) });

test("t555u: Kapradina (M1 4:40, živý 9:20 > M2 Bukvice 9:07) je pod Bukvicí ve všech výstupech", () => {
  const kapradina = live(246, at(9, 20), { m1: at(4, 40) });
  const o = orders([bukviceF, bukviceV, doubekR, siska, kapradina], NOW);
  // Šiška (živý 7:35 < 9:07, M1 4:40 < 4:42) Bukvici ještě porazit může → nad ním
  assert.deepEqual(o.speaker, [254, 235, 253, 227, 246]);
  assert.deepEqual(o.online, o.speaker);
  assert.deepEqual(o.board, o.speaker);
});

test("t555u: přehození přesně ve chvíli, kdy živý čas přesáhne čas soupeře na M2 (bez blikání)", () => {
  const positions: number[] = [];
  for (let l = at(9, 0); l <= at(9, 15); l += 1) {
    const kapradina = runner(246, 10_000 - at(9, 20), { m1: at(4, 40) });
    const now = NOW - at(9, 20) + l; // živý čas Kapradiny = l
    const order = orders([bukviceF, kapradina], now).speaker;
    positions.push(order.indexOf(246));
    if (l <= at(9, 7)) assert.deepEqual(order, [246, 227], `živý ${l} ≤ 547 → ještě nad`);
    else assert.deepEqual(order, [227, 246], `živý ${l} > 547 → pod`);
  }
  // pozice se změní jen jednou
  assert.equal(positions.filter((p, i) => i > 0 && p !== positions[i - 1]).length, 1);
});

test("t555u obdobně v cíli: na M2 lepší, ale živý čas přesáhl cílový čas → pod", () => {
  const m2 = live(9, at(13, 40), { m1: at(4, 35), m2: at(9, 0) }); // 13:40 > 13:33
  assert.deepEqual(orders([bukviceF, m2], NOW).speaker, [227, 9]);
  const m2ok = live(9, at(13, 30), { m1: at(4, 35), m2: at(9, 0) });
  assert.deepEqual(orders([bukviceF, m2ok], NOW).speaker, [9, 227]);
});

test("t555u obdobně na M1: kdo M1 ještě nemá, je vždy pod řádky s časy (skupina odstartovaní)", () => {
  // i když jeho živý čas (3:00) je pod M1 všech ostatních – bez času není s čím porovnat
  const fresh = live(9, at(3, 0), { started: true });
  const o = orders([bukviceF, doubekR, fresh], NOW);
  assert.deepEqual(o.online, [254, 227]);
  assert.deepEqual(
    o.state.running.map((r) => r.bib),
    [9],
  );
});

test("t555u: vynechaný mezičas soupeře se přeskočí – rozhoduje další jeho bod", () => {
  const noM2 = live(1, at(20, 0), { m1: at(4, 42), fin: at(13, 33) });
  const a = live(9, at(10, 0), { m1: at(4, 40) }); // 10:00 < 13:33, M1 lepší → nad
  assert.deepEqual(orders([noM2, a], NOW).speaker, [9, 1]);
  const b = live(9, at(13, 34), { m1: at(4, 40) }); // 13:34 > 13:33 → pod
  assert.deepEqual(orders([noM2, b], NOW).speaker, [1, 9]);
});

test("Q155: pod výsledky zůstávají skupiny odstartovaní → čekající → DNS (online i resultboard)", () => {
  const now = T0 + 1000;
  const list = [
    leader,
    runner(9, 600, { m1: 310 }),
    runner(20, 950, { started: true }), // odstartoval, bez mezičasu
    runner(30, 1100), // čeká na start
    runner(40, 300), // DNS (bez startu, po lhůtě)
  ];
  const o = orders(list, now);
  assert.deepEqual(o.online, [9, 1]);
  assert.deepEqual(
    boardItems(o.state, DEFAULT_RESULTBOARD_CONFIG).map((it) =>
      it.kind === "div" ? it.variant : it.kind === "res" ? it.row.runner.bib : it.runner.bib,
    ),
    [9, 1, "run", 20, "wait", 30, "dns", 40],
  );
  const hidden = boardItems(o.state, { showRunning: false, showWaiting: false, showDns: false });
  assert.deepEqual(
    hidden.map((it) => (it.kind === "res" ? it.row.runner.bib : it.kind)),
    [9, 1],
  );
});
