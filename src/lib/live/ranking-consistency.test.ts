/**
 * Q155: speaker, online výsledky (`/vysledky/online`) i resultboard řadí běžce s časy
 * stejně – jedna funkce `combinedOrder` (speaker-core). Kdo má jen M1 a ten je lepší než
 * M1 vedoucího v cíli, je nad ním (dokud ho ještě může porazit). Pod výsledky zůstávají
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

test("Q155: jen M1 lepší, ale živý čas už přesáhl cílový čas vedoucího → pod něj", () => {
  const m1Only = runner(9, 0, { m1: 310 }); // teď 950 → živý čas 950 s > 900 s
  const o = orders([leader, second, m1Only], T0 + 950);
  assert.deepEqual(o.speaker, [1, 9, 2]); // druhého (950) ještě porazit může
  assert.deepEqual(o.online, o.speaker);
  assert.deepEqual(o.board, o.speaker);
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
