import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bestSample,
  buildStarterList,
  buildStarterView,
  clockQuality,
  countsAsStartRecord,
  corridorOf,
  corridorRange,
  cuesFor,
  decideAutoMark,
  decideStarterWrite,
  decideWebStartWrite,
  dnsWindowFromSetting,
  formatCountdown,
  isLateStart,
  keypadLookup,
  mergePending,
  parseCorridor,
  parseSoundMode,
  plannedStartMs,
  publicLateOffset,
  redPhaseFromSetting,
  sourceRank,
  tapAction,
  zoneFor,
  type StarterMark,
  type StarterRunner,
} from "./starter-core";

const ZERO = Date.UTC(2026, 5, 13, 8, 15, 0);
const runner = (bib: number, intervalS = 15, from = 601): StarterRunner => ({
  bib,
  name: `Běžec ${bib}`,
  club: null,
  plannedMs: plannedStartMs(ZERO, bib, intervalS, from),
});
const mark = (bib: number, source = "starter", markedAt: number | null = 0): StarterMark => ({
  bib,
  source,
  markedAt,
  late: false,
});

test("corridor follows the edition boundary, not a fixed 600", () => {
  assert.equal(corridorOf(1, 601), 1);
  assert.equal(corridorOf(600, 601), 1);
  assert.equal(corridorOf(601, 601), 2);
  assert.equal(corridorOf(501, 501), 2);
  assert.equal(corridorOf(500, 501), 1);
  assert.deepEqual(corridorRange(1, 501), { first: 1, last: 500 });
  assert.deepEqual(corridorRange(2, 501), { first: 501, last: null });
  assert.equal(parseCorridor("2"), 2);
  assert.equal(parseCorridor(3), null);
  assert.equal(parseCorridor(""), null);
});

test("planned start uses the slot within its start", () => {
  assert.equal(plannedStartMs(ZERO, 1, 15, 601), ZERO);
  assert.equal(plannedStartMs(ZERO, 601, 15, 601), ZERO);
  assert.equal(plannedStartMs(ZERO, 641, 15, 601), ZERO + 40 * 15_000);
  assert.equal(plannedStartMs(ZERO, 501, 20, 501), ZERO);
  assert.equal(plannedStartMs(ZERO, 3, 20, 501), ZERO + 40_000);
});

test("zones: green ≤15 s, orange 16–30 s, grey later, red after start, then gone", () => {
  const planned = ZERO + 60_000;
  assert.equal(zoneFor(planned, planned - 31_000, 5, 15), "later");
  assert.equal(zoneFor(planned, planned - 30_000, 5, 15), "next");
  assert.equal(zoneFor(planned, planned - 16_000, 5, 15), "next");
  assert.equal(zoneFor(planned, planned - 15_500, 5, 15), "next");
  assert.equal(zoneFor(planned, planned - 15_000, 5, 15), "now");
  assert.equal(zoneFor(planned, planned - 1, 5, 15), "now");
  assert.equal(zoneFor(planned, planned, 5, 15), "red");
  assert.equal(zoneFor(planned, planned + 4_999, 5, 15), "red");
  assert.equal(zoneFor(planned, planned + 5_000, 5, 15), "gone");
  assert.equal(zoneFor(planned, planned, 0, 15), "gone");
});

test("late start is more than 15 s after the plan", () => {
  assert.equal(isLateStart(ZERO + 15_000, ZERO, 15), false);
  assert.equal(isLateStart(ZERO + 15_001, ZERO, 15), true);
  assert.equal(isLateStart(ZERO - 60_000, ZERO, 15), false);
});

test("zones and late threshold follow the edition interval (20 s)", () => {
  const planned = ZERO + 60_000;
  assert.equal(zoneFor(planned, planned - 41_000, 5, 20), "later");
  assert.equal(zoneFor(planned, planned - 40_000, 5, 20), "next");
  assert.equal(zoneFor(planned, planned - 21_000, 5, 20), "next");
  assert.equal(zoneFor(planned, planned - 20_000, 5, 20), "now");
  assert.equal(zoneFor(planned, planned - 16_000, 5, 20), "now");
  assert.equal(isLateStart(ZERO + 20_000, ZERO, 20), false);
  assert.equal(isLateStart(ZERO + 20_001, ZERO, 20), true);
  // 20 s interval: číslo 3 startuje 40 s po nule
  assert.equal(plannedStartMs(ZERO, 3, 20, 601), ZERO + 40_000);
});

test("queue: at most 4 rows, marked runners disappear at start, red phase, Nevyběhli window", () => {
  const runners = [1, 2, 3, 4, 5, 6, 7, 8].map((bib) => runner(bib));
  const now = ZERO + 2 * 15_000 + 2_000; // 2 s po startu čísla 3
  const marks = new Map([[1, mark(1)]]);
  const view = buildStarterView(runners, marks, now, {
    redPhaseS: 5,
    dnsWindowS: 300,
    intervalS: 15,
  });
  // 1 odstartoval (označený), 2 nevyběhl (po červené fázi), 3 je červený
  assert.deepEqual(
    view.queue.map((row) => [row.bib, row.zone]),
    [
      [3, "red"],
      [4, "now"],
      [5, "next"],
      [6, "later"],
    ],
  );
  assert.deepEqual(
    view.missing.map((r) => r.bib),
    [2],
  );
  assert.deepEqual(view.counts, { toStart: 6, missing: 1 });
});

test("Nevyběhli strip shows only the window; older ones stay in the count", () => {
  const runners = [1, 2, 3, 30].map((bib) => runner(bib));
  const now = ZERO + 29 * 15_000 - 20_000;
  const view = buildStarterView(runners, new Map(), now, {
    redPhaseS: 5,
    dnsWindowS: 60,
    intervalS: 15,
  });
  assert.deepEqual(view.missing, []);
  assert.equal(view.counts.missing, 3);
  const wide = buildStarterView(runners, new Map(), now, {
    redPhaseS: 5,
    dnsWindowS: 3600,
    intervalS: 15,
  });
  assert.deepEqual(
    wide.missing.map((r) => r.bib),
    [3, 2, 1],
  );
});

test("marked runner before start stays in the queue with marked flag", () => {
  const runners = [runner(5)];
  const view = buildStarterView(runners, new Map([[5, mark(5)]]), ZERO, {
    redPhaseS: 5,
    dnsWindowS: 300,
    intervalS: 15,
  });
  assert.equal(view.queue[0]?.marked, true);
  assert.equal(view.queue[0]?.zone, "later");
});

test("full list filters", () => {
  const runners = [1, 2, 3].map((bib) => runner(bib));
  const now = ZERO + 15_000 + 10_000;
  const marks = new Map([[1, mark(1)]]);
  const all = buildStarterList(runners, marks, now, 5, "all");
  assert.deepEqual(
    all.map((r) => r.state),
    ["started", "missing", "pending"],
  );
  assert.deepEqual(
    buildStarterList(runners, marks, now, 5, "missing").map((r) => r.bib),
    [2],
  );
  assert.deepEqual(
    buildStarterList(runners, marks, now, 5, "pending").map((r) => r.bib),
    [3],
  );
});

test("tap action by time", () => {
  assert.equal(tapAction(ZERO, ZERO - 1, false, 5), "mark");
  assert.equal(tapAction(ZERO, ZERO - 1, true, 5), "unmark");
  assert.equal(tapAction(ZERO, ZERO + 1_000, false, 5), "ontime");
  assert.equal(tapAction(ZERO, ZERO + 6_000, false, 5), "late");
  assert.equal(tapAction(ZERO, ZERO + 1_000, true, 5), null);
});

test("priority: admin > starter/web > split", () => {
  const t = new Date(ZERO);
  assert.equal(sourceRank("admin"), 3);
  assert.equal(sourceRank("starter"), 2);
  assert.equal(sourceRank("web"), 2);
  assert.equal(sourceRank("split"), 1);
  assert.equal(decideStarterWrite(null, "mark", t), "insert");
  assert.equal(decideStarterWrite({ source: "admin", markedAt: null }, "mark", t), "ignored");
  assert.equal(decideStarterWrite({ source: "admin", markedAt: null }, "unmark", t), "ignored");
  // pozdě dorazivší offline ťuknutí přepíše automatické doplnění ze splitu
  assert.equal(decideStarterWrite({ source: "split", markedAt: null }, "ontime", t), "update");
  assert.equal(decideStarterWrite({ source: "split", markedAt: null }, "unmark", t), "ignored");
  // mezi zařízeními platí poslední akce
  const later = new Date(ZERO + 1000);
  assert.equal(decideStarterWrite({ source: "starter", markedAt: later }, "unmark", t), "ignored");
  assert.equal(decideStarterWrite({ source: "starter", markedAt: t }, "unmark", later), "delete");
  assert.equal(decideStarterWrite({ source: "starter", markedAt: later }, "mark", t), "ignored");
  assert.equal(decideStarterWrite({ source: "web", markedAt: null }, "late", t), "update");
  assert.equal(decideStarterWrite(null, "unmark", t), "ignored");
  assert.equal(decideWebStartWrite(null), "insert");
  assert.equal(decideWebStartWrite({ source: "split" }), "replace");
  assert.equal(decideWebStartWrite({ source: "starter" }), "duplicate");
  assert.equal(decideAutoMark(null), "insert");
  assert.equal(decideAutoMark({ source: "starter" }), "skip");
});

test("pending device actions merge in tap order", () => {
  const plannedOf = (bib: number) => plannedStartMs(ZERO, bib, 15, 601);
  const merged = mergePending(
    new Map([[2, mark(2, "admin", null)]]),
    [
      { id: "b", bib: 1, action: "unmark", at: ZERO - 5_000 },
      { id: "a", bib: 1, action: "mark", at: ZERO - 10_000 },
      { id: "c", bib: 2, action: "unmark", at: ZERO - 1_000 },
      { id: "d", bib: 3, action: "late", at: plannedOf(3) + 40_000 },
    ],
    plannedOf,
    15,
  );
  assert.equal(merged.has(1), false);
  assert.equal(merged.get(2)?.source, "admin");
  assert.equal(merged.get(3)?.late, true);
});

test("clock quality", () => {
  const now = 1_000_000;
  assert.equal(clockQuality({ uncertaintyMs: null, lastSyncAt: null, now }), "none");
  assert.equal(clockQuality({ uncertaintyMs: 40, lastSyncAt: now - 1000, now }), "good");
  assert.equal(clockQuality({ uncertaintyMs: 180, lastSyncAt: now - 1000, now }), "good");
  assert.equal(clockQuality({ uncertaintyMs: 251, lastSyncAt: now - 1000, now }), "warn");
  assert.equal(clockQuality({ uncertaintyMs: 40, lastSyncAt: now - 5 * 60_000 - 1, now }), "warn");
  assert.deepEqual(bestSample([{ rtt: 90 }, { rtt: 30 }, { rtt: 50 }]), { rtt: 30 });
  assert.equal(bestSample([]), null);
});

test("settings parsing and sound cues", () => {
  assert.equal(parseSoundMode("voice_count"), "voice_count");
  assert.equal(parseSoundMode("nonsense"), "beep");
  assert.equal(parseSoundMode(undefined), "beep");
  assert.equal(redPhaseFromSetting(undefined), 5);
  assert.equal(redPhaseFromSetting("0"), 0);
  assert.equal(redPhaseFromSetting("999"), 5);
  assert.equal(dnsWindowFromSetting("600"), 600);
  assert.equal(dnsWindowFromSetting("x"), 300);
  const beeps = cuesFor("beep", ZERO);
  assert.equal(beeps.filter((c) => c.kind === "short").length, 5);
  assert.deepEqual(beeps.at(-1), { at: ZERO, kind: "long" });
  assert.equal(beeps[0]?.at, ZERO - 5000);
  assert.deepEqual(
    cuesFor("voice_ready", ZERO).map((c) => c.text),
    ["připrav se", "pozor", "start"],
  );
  assert.deepEqual(
    cuesFor("voice_count", ZERO).map((c) => c.text),
    ["3", "2", "1", "start"],
  );
  assert.deepEqual(cuesFor("off", ZERO), []);
  assert.equal(formatCountdown(75), "1:15");
  assert.equal(formatCountdown(-3), "-0:03");
});

test("keypad lookup", () => {
  const runners = new Map([1, 2, 640].map((bib) => [bib, runner(bib)]));
  const base = {
    corridor: 1 as const,
    secondStartFrom: 601,
    runners,
    marks: new Map<number, StarterMark>(),
    redPhaseS: 5,
  };
  assert.deepEqual(keypadLookup({ ...base, bib: 640, nowMs: ZERO }), {
    kind: "other-corridor",
    corridor: 2,
  });
  assert.equal(keypadLookup({ ...base, bib: 99, nowMs: ZERO }).kind, "unknown");
  assert.equal(keypadLookup({ ...base, bib: 2, nowMs: ZERO }).kind, "pending");
  assert.equal(keypadLookup({ ...base, bib: 1, nowMs: ZERO + 60_000 }).kind, "missing");
  assert.equal(
    keypadLookup({ ...base, bib: 1, nowMs: ZERO + 60_000, marks: new Map([[1, mark(1)]]) }).kind,
    "started",
  );
});

test("online results late label", () => {
  assert.equal(publicLateOffset({ source: "split", late: false }, 500, 120), null);
  assert.equal(publicLateOffset({ source: "starter", late: true }, 40, 120), 40);
  assert.equal(publicLateOffset({ source: "starter", late: false }, 0, 120), null);
  assert.equal(publicLateOffset({ source: "web", late: false }, 130, 120), 130);
  assert.equal(publicLateOffset({ source: "admin", late: false }, 30, 120), null);
  assert.equal(countsAsStartRecord({ source: "split" }), false);
  assert.equal(countsAsStartRecord({ source: "starter" }), true);
});
