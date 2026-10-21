import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BibRange } from "./start-settings";
import {
  checkStartList,
  inOrganizerBlock,
  outsideCategory,
  reserveSummary,
  type CheckRow,
} from "./startlist-check";
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
  it("finds duplicates, unpaid with bib and missing bibs; a bib outside the category is fine", () => {
    const issues = checkStartList(
      DEFAULT_START_MODEL,
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
      ["duplicate", "invalidWithBib", "missingBib"],
    );
  });
  it("detects split groups", () => {
    const issues = checkStartList(
      DEFAULT_START_MODEL,
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
  it("accepts mixed-category groups; a joint group of 3 may use two neighbouring times", () => {
    const issues = checkStartList(
      DEFAULT_START_MODEL,
      [
        row({ runnerId: "dad", bib: 310 }),
        row({ runnerId: "mum", bib: 910, categoryId: "F" }),
        row({ runnerId: "kid", bib: 311, categoryId: "J" }),
        row({ runnerId: "x", bib: 320 }),
        row({ runnerId: "y", bib: 921, categoryId: "F" }),
        row({ runnerId: "z", bib: 323, categoryId: "J" }),
        row({ runnerId: "p", bib: 50, categoryId: "J" }),
        row({ runnerId: "q", bib: 51 }),
      ],
      [
        { id: 1, kind: "joint", memberIds: ["dad", "mum", "kid"] },
        { id: 2, kind: "joint", memberIds: ["x", "y", "z"] },
        { id: 3, kind: "consecutive", memberIds: ["p", "q"] },
      ],
    );
    assert.deepEqual(issues, [{ code: "groupSplit", groupId: 2, kind: "joint" }]);
  });
});

describe("outsideCategory", () => {
  it("marks bibs outside the own window, except champions and organizers in their block", () => {
    const check = (partial: Partial<CheckRow>) =>
      outsideCategory(DEFAULT_START_MODEL, RANGES, CHAMPS, row({ runnerId: "r", ...partial }));
    assert.equal(check({ bib: 310 }), false);
    assert.equal(check({ bib: 50 }), true, "A runner in the J window");
    assert.equal(check({ bib: 910 }), true, "A runner in the 2nd start");
    assert.equal(check({ bib: 400 }), false, "champion bib");
    assert.equal(check({ bib: 3, organizer: true }), false);
    assert.equal(check({ bib: 3 }), true);
    assert.equal(check({ bib: null }), false);
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
