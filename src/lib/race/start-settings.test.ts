import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatInterval,
  reserveIntervals,
  validateStartSettings,
  type BibRange,
} from "./start-settings";
import { DEFAULT_START_MODEL } from "./start-time";

const LEGACY: BibRange[] = [
  { categoryId: "J", bibFrom: 41, bibTo: 90 },
  { categoryId: "E", bibFrom: 111, bibTo: 120 },
  { categoryId: "C", bibFrom: 131, bibTo: 190 },
  { categoryId: "B", bibFrom: 201, bibTo: 290 },
  { categoryId: "A", bibFrom: 301, bibTo: 380 },
  { categoryId: "K", bibFrom: 641, bibTo: 680 },
  { categoryId: "D", bibFrom: 691, bibTo: 710 },
  { categoryId: "I", bibFrom: 721, bibTo: 730 },
  { categoryId: "H", bibFrom: 741, bibTo: 760 },
  { categoryId: "G", bibFrom: 771, bibTo: 810 },
  { categoryId: "M", bibFrom: 821, bibTo: 850 },
  { categoryId: "L", bibFrom: 861, bibTo: 900 },
  { categoryId: "F", bibFrom: 901, bibTo: 930 },
];

describe("validateStartSettings", () => {
  it("accepts the 2026 defaults", () => {
    assert.deepEqual(
      validateStartSettings(DEFAULT_START_MODEL, LEGACY, { men: 400, women: 950 }),
      [],
    );
  });
  it("detects overlaps, ranges across starts and champions inside ranges", () => {
    const issues = validateStartSettings(
      DEFAULT_START_MODEL,
      [
        { categoryId: "A", bibFrom: 301, bibTo: 380 },
        { categoryId: "B", bibFrom: 370, bibTo: 390 },
        { categoryId: "F", bibFrom: 590, bibTo: 620 },
        { categoryId: "X", bibFrom: 10, bibTo: 5 },
      ],
      { men: 305, women: 305 },
    );
    const codes = issues.map((issue) => issue.code).sort();
    assert.deepEqual(codes, [
      "championInRange",
      "championInRange",
      "championSame",
      "rangeOrder",
      "rangeOverlap",
      "rangeSeries",
    ]);
  });
  it("rejects invalid model values", () => {
    const issues = validateStartSettings(
      { zeroSeconds: 90000, intervalSeconds: 0, secondStartFrom: 1 },
      [],
      { men: null, women: null },
    );
    assert.deepEqual(
      issues.map((issue) => issue.code),
      ["zero", "interval", "secondStart"],
    );
  });
});

describe("reserveIntervals", () => {
  it("reserves numbers after the last assigned bib, around the champion bib", () => {
    const first = reserveIntervals(DEFAULT_START_MODEL, 1, 400, 377, LEGACY);
    assert.deepEqual(first.map(formatInterval), ["378–399", "401–600"]);
    const second = reserveIntervals(DEFAULT_START_MODEL, 2, 950, 928, LEGACY);
    assert.deepEqual(second.map(formatInterval), ["929–949", "951+"]);
  });
  it("falls back to the end of the category ranges when nothing is assigned", () => {
    const first = reserveIntervals(DEFAULT_START_MODEL, 1, 400, null, LEGACY);
    assert.deepEqual(first.map(formatInterval), ["381–399", "401–600"]);
  });
  it("works without a champion bib", () => {
    const second = reserveIntervals(DEFAULT_START_MODEL, 2, null, 930, LEGACY);
    assert.deepEqual(second.map(formatInterval), ["931+"]);
  });
});

describe("issue codes in the URL", () => {
  it("round-trips", async () => {
    const { encodeStartIssues, decodeStartIssues } = await import("./start-settings");
    const raw = encodeStartIssues([
      { code: "zero" },
      { code: "rangeOverlap", categoryId: "B", other: "A" },
      { code: "championInRange", bib: 305, categoryId: "A" },
    ]);
    assert.equal(raw, "zero,rangeOverlap.B.A,championInRange.A.305");
    assert.deepEqual(decodeStartIssues(raw + ",bogus"), [
      { code: "zero", category: undefined, other: undefined },
      { code: "rangeOverlap", category: "B", other: "A" },
      { code: "championInRange", category: "A", other: "305" },
    ]);
  });
});
