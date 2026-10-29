import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TR_LATE_S,
  badgesOf,
  cardsOf,
  emptyTrTracker,
  liveRecordMarks,
  recordBaselines,
  trackRecords,
  type TrMark,
  type TrRunner,
} from "./records-live-core";

// ID: RRRR + 5. znak pohlaví (0–4 muž, 5–9 žena) + pořadí.
const A = { id: "A", sex: "M", age: 0 };
const B = { id: "B", sex: "M", age: 40 };
const F = { id: "F", sex: "F", age: 0 };
const J = { id: "J", sex: "M", age: 14 };
const categories = [J, A, B, F];
const YEAR = 2026;

const history = [
  { year: 2018, runnerId: "19900001", time: 846, name: "Janů Jan" }, // A
  { year: 2015, runnerId: "19700002", time: 960, name: "Kratochvíl Miloš" }, // B (45)
  { year: 2018, runnerId: "19955003", time: 1000, name: "Stránská Adéla" }, // F
  { year: 2026, runnerId: "19900004", time: 700, name: "Dnešní import" }, // ignorováno
];
const baselines = recordBaselines(categories, history, YEAR, (r) => r.name);

const runner = (bib: number, runnerId: string, cat: string, fin: number | null, start = 0) =>
  ({ bib, name: `R${bib}`, cat, start, fin, runnerId }) satisfies TrRunner;

describe("record baselines (Q162)", () => {
  it("uses only earlier editions and keeps holder and year", () => {
    assert.deepEqual(baselines.get("A"), { time: 846, who: "Janů Jan", year: 2018 });
    assert.deepEqual(baselines.get("B"), { time: 960, who: "Kratochvíl Miloš", year: 2015 });
    assert.equal(baselines.has("J"), false, "no result → no record → no TR");
  });
});

describe("live record marks", () => {
  it("absolute and category record of one runner", () => {
    const marks = liveRecordMarks(
      [runner(201, "19800010", "B", 840)], // 46 let, rychlejší než A i B
      categories,
      baselines,
      YEAR,
    );
    assert.deepEqual(
      marks.map((m) => [m.rec, m.abs, m.eq]),
      [
        ["A", true, false],
        ["B", false, false],
      ],
    );
    const [card] = cardsOf(marks);
    assert.equal(card.main.rec, "A", "absolute record is the main one (Q159)");
    assert.deepEqual(card.main.prev, { time: 846, who: "Janů Jan", year: 2018 });
    assert.deepEqual(
      card.extra.map((m) => m.rec),
      ["B"],
    );
  });

  it("equal time = equalled record (weaker), slower = nothing", () => {
    const marks = liveRecordMarks(
      [runner(301, "19900011", "A", 846), runner(302, "19900012", "A", 847)],
      categories,
      baselines,
      YEAR,
    );
    assert.deepEqual(
      marks.map((m) => [m.bib, m.eq]),
      [[301, true]],
    );
    assert.equal(badgesOf(marks).get(301), "eq");
  });

  it("follows the finish order: a later faster runner takes the record over", () => {
    const marks = liveRecordMarks(
      [
        runner(301, "19900011", "A", 840, 0), // cíl v 840
        runner(302, "19900012", "A", 845, 100), // cíl 945, pomalejší než 840 → nic
        runner(303, "19900013", "A", 830, 200), // cíl 1030 → nový rekord
      ],
      categories,
      baselines,
      YEAR,
    );
    assert.deepEqual(
      marks.map((m) => m.bib),
      [303],
    );
    assert.deepEqual(marks[0].prev, { time: 840, who: "R301", year: YEAR });
  });

  it("eligibility by sex and age, not by the category the runner ran", () => {
    const marks = liveRecordMarks(
      [
        runner(401, "19905014", "A", 800), // žena omylem v mužích → jen F
        runner(402, "19950015", "B", 950), // 31 let v B → B ne, A ne (pomalejší)
      ],
      categories,
      baselines,
      YEAR,
    );
    assert.deepEqual(
      marks.map((m) => [m.bib, m.rec]),
      [[401, "F"]],
    );
  });
});

const mark = (bib: number, at: number, extra: Partial<TrMark> = {}): TrMark => ({
  bib,
  rec: "A",
  abs: true,
  eq: false,
  time: 800,
  at,
  prev: { time: 846, who: "Janů Jan", year: 2018 },
  ...extra,
});

describe("browser tracking (Q164)", () => {
  const now = 10_000_000;
  it("first snapshot never fires", () => {
    const r = trackRecords(emptyTrTracker(), [mark(1, now / 1000)], now);
    assert.equal(r.cards.length, 0);
  });
  it("a new mark fires once", () => {
    const first = trackRecords(emptyTrTracker(), [], now).tracker;
    const m = mark(1, now / 1000);
    const step = trackRecords(first, [m], now + 5000);
    assert.equal(step.cards.length, 1);
    assert.equal(trackRecords(step.tracker, [m], now + 10_000).cards.length, 0);
  });
  it("late finishes and a gap only set a new baseline", () => {
    const first = trackRecords(emptyTrTracker(), [], now).tracker;
    const late = trackRecords(first, [mark(1, now / 1000 - TR_LATE_S - 10)], now + 5000);
    assert.equal(late.cards.length, 0);
    const gap = trackRecords(first, [mark(2, now / 1000 + 100)], now + 120_000);
    assert.equal(gap.cards.length, 0);
  });
  it("cards are ordered by finish and grouped per runner", () => {
    const cards = cardsOf([
      mark(2, 20),
      mark(1, 10, { rec: "B", abs: false }),
      mark(1, 10),
      mark(3, 30, { eq: true }),
    ]);
    assert.deepEqual(
      cards.map((c) => [c.bib, c.main.rec, c.extra.length]),
      [
        [1, "A", 1],
        [2, "A", 0],
        [3, "A", 0],
      ],
    );
  });
});
