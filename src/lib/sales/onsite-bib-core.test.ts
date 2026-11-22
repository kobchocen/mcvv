import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_START_MODEL } from "@/lib/race/start-time";

import { suggestOnsiteBib } from "./onsite-bib-core";

const RANGES = [
  { categoryId: "A", bibFrom: 301, bibTo: 305 },
  { categoryId: "B", bibFrom: 306, bibTo: 320 },
  { categoryId: "K", bibFrom: 641, bibTo: 643 },
];
const base = {
  model: DEFAULT_START_MODEL,
  ranges: RANGES,
  champions: [400, 950],
};

describe("suggestOnsiteBib (#222)", () => {
  it("takes the lowest free bib in the category window", () => {
    const s = suggestOnsiteBib({ ...base, categoryId: "A", taken: new Set([301, 302, 304]) });
    assert.deepEqual(s, { bib: 303, series: 1, outsideCategory: false });
  });

  it("stays in the second start line for a 601+ category", () => {
    const s = suggestOnsiteBib({ ...base, categoryId: "K", taken: new Set([641]) });
    assert.deepEqual(s, { bib: 642, series: 2, outsideCategory: false });
  });

  it("full window: nearest free bib after it, same line, not in another window", () => {
    const s = suggestOnsiteBib({ ...base, categoryId: "K", taken: new Set([641, 642, 643]) });
    assert.deepEqual(s, { bib: 644, series: 2, outsideCategory: true });
    const a = suggestOnsiteBib({
      ...base,
      categoryId: "A",
      taken: new Set([301, 302, 303, 304, 305]),
    });
    // 306–320 je okno kategorie B → první volné před oknem A
    assert.deepEqual(a, { bib: 300, series: 1, outsideCategory: true });
  });

  it("never suggests a champion bib or a taken one", () => {
    const s = suggestOnsiteBib({
      model: DEFAULT_START_MODEL,
      ranges: [{ categoryId: "M", bibFrom: 399, bibTo: 401 }],
      champions: [400],
      categoryId: "M",
      taken: new Set([399]),
    });
    assert.equal(s?.bib, 401);
  });

  it("category without a range uses the first line", () => {
    const s = suggestOnsiteBib({ ...base, categoryId: "Z", taken: new Set([1, 2]) });
    assert.equal(s?.series, 1);
    assert.equal(s?.bib, 3);
  });

  it("on race day skips bibs starting too soon", () => {
    // 10:15 nula, interval 15 s → 301 startuje 11:30:00 SEČ = 10:30 UTC
    const raceDate = new Date(Date.UTC(2026, 11, 6));
    const s = suggestOnsiteBib({
      ...base,
      categoryId: "A",
      taken: new Set(),
      raceDate,
      now: new Date("2026-12-06T10:15:05Z"), // 11:15:05 → nejdřív 11:30:05
    });
    assert.equal(s?.bib, 302);
  });

  it("suggestion is consistent under a concurrent sale (re-pick sees the new taken bib)", () => {
    const taken = new Set([301]);
    const first = suggestOnsiteBib({ ...base, categoryId: "A", taken })!;
    taken.add(first.bib); // druhá pokladna mezitím uložila stejný návrh
    const second = suggestOnsiteBib({ ...base, categoryId: "A", taken })!;
    assert.notEqual(second.bib, first.bib);
  });
});
