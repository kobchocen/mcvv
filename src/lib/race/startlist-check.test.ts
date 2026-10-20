import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BibRange } from "./start-settings";
import { checkStartList, inOrganizerBlock, reserveSummary, type CheckRow } from "./startlist-check";
import { DEFAULT_START_MODEL } from "./start-time";

const RANGES: BibRange[] = [
  { categoryId: "J", bibFrom: 41, bibTo: 90 },
  { categoryId: "A", bibFrom: 301, bibTo: 380 },
  { categoryId: "F", bibFrom: 901, bibTo: 930 },
];
const CHAMPS = { men: 400, women: 950 };

function row(partial: Partial<CheckRow> & { runnerId: string }): CheckRow {
  return {
    categoryId: "A",
    bib: null,
    valid: true,
    cancelled: false,
    organizer: false,
    ...partial,
  };
}

describe("checkStartList", () => {
  it("finds duplicates, out-of-range, unpaid with bib and missing bibs", () => {
    const issues = checkStartList(
      DEFAULT_START_MODEL,
      RANGES,
      CHAMPS,
      [
        row({ runnerId: "a", bib: 301 }),
        row({ runnerId: "b", bib: 301 }),
        row({ runnerId: "c", bib: 50 }),
        row({ runnerId: "d", bib: 310, valid: false }),
        row({ runnerId: "e" }),
        row({ runnerId: "f", bib: 400 }),
        row({ runnerId: "g", bib: 3, organizer: true }),
        row({ runnerId: "h", bib: 320, cancelled: true }),
      ],
      [],
    );
    assert.deepEqual(
      issues.map((i) => i.code),
      ["duplicate", "outOfRange", "invalidWithBib", "missingBib"],
    );
  });
  it("detects split groups", () => {
    const issues = checkStartList(
      DEFAULT_START_MODEL,
      RANGES,
      CHAMPS,
      [
        row({ runnerId: "a", bib: 310 }),
        row({ runnerId: "b", bib: 910, categoryId: "F" }),
        row({ runnerId: "c", bib: 311 }),
        row({ runnerId: "d", bib: 313 }),
      ],
      [
        { id: 1, kind: "joint", memberIds: ["a", "b"] },
        { id: 2, kind: "consecutive", memberIds: ["c", "d"] },
      ],
    );
    assert.deepEqual(issues, [{ code: "groupSplit", groupId: 2, kind: "consecutive" }]);
  });
});

describe("inOrganizerBlock", () => {
  it("covers 1–40 and 601–900 before the first 2nd-start range", () => {
    assert.equal(inOrganizerBlock(DEFAULT_START_MODEL, RANGES, 1), true);
    assert.equal(inOrganizerBlock(DEFAULT_START_MODEL, RANGES, 40), true);
    assert.equal(inOrganizerBlock(DEFAULT_START_MODEL, RANGES, 41), false);
    assert.equal(inOrganizerBlock(DEFAULT_START_MODEL, RANGES, 601), true);
  });
});

describe("reserveSummary", () => {
  it("computes reserve ranges from assigned bibs and counts used reserve numbers", () => {
    const [first, second] = reserveSummary(
      DEFAULT_START_MODEL,
      RANGES,
      CHAMPS,
      [41, 300, 377, 385, 400, 920, 960],
    );
    assert.deepEqual(first.intervals, [
      { from: 378, to: 399 },
      { from: 401, to: 600 },
    ]);
    assert.equal(first.used, 1);
    assert.deepEqual(second.intervals, [
      { from: 921, to: 949 },
      { from: 951, to: null },
    ]);
    assert.equal(second.used, 1);
  });
});
