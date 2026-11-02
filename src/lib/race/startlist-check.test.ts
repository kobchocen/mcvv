import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BibRange } from "./start-settings";
import { checkStartList, outsideCategory, reserveSummary, type CheckRow } from "./startlist-check";
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
    specialKind: null,
    ...partial,
  };
}

describe("checkStartList", () => {
  it("finds duplicates, unpaid with bib and missing bibs; a bib outside the category is fine", () => {
    const issues = checkStartList(DEFAULT_START_MODEL, [
      row({ runnerId: "a", bib: 301 }),
      row({ runnerId: "b", bib: 301 }),
      row({ runnerId: "c", bib: 50 }),
      row({ runnerId: "d", bib: 310, valid: false }),
      row({ runnerId: "e" }),
      row({ runnerId: "f", bib: 400 }),
      row({ runnerId: "g", bib: 3, specialKind: "organizer" }),
      row({ runnerId: "h", bib: 320, cancelled: true }),
    ]);
    assert.deepEqual(
      issues.map((i) => i.code),
      ["duplicate", "invalidWithBib", "missingBib"],
    );
  });
  it("reports ranged spec. starts outside their range (Q236, Q221, Q222, Q237)", () => {
    const issues = checkStartList(DEFAULT_START_MODEL, [
      row({ runnerId: "o1", bib: 640, specialKind: "organizer" }),
      row({ runnerId: "o2", bib: 41, specialKind: "organizer" }),
      row({ runnerId: "e1", bib: 699, specialKind: "early" }),
      row({ runnerId: "e2", bib: 320, specialKind: "early" }),
      row({ runnerId: "e3", bib: 100, specialKind: "early" }),
      row({ runnerId: "l1", bib: 861, specialKind: "late" }),
      row({ runnerId: "l2", bib: 900, specialKind: "late" }),
      row({ runnerId: "w", bib: 500, specialKind: "with" }),
      row({ runnerId: "x", bib: 330, specialKind: "early", cancelled: true }),
      row({ runnerId: "y", bib: 331, specialKind: "early", valid: false }),
    ]);
    assert.deepEqual(
      issues.filter((i) => i.code === "specOutsideRange"),
      [
        { code: "specOutsideRange", kind: "organizer", runnerIds: ["o2"] },
        { code: "specOutsideRange", kind: "early", runnerIds: ["e3", "e2"] },
        { code: "specOutsideRange", kind: "late", runnerIds: ["l2"] },
      ],
    );
  });
});

describe("outsideCategory", () => {
  it("marks bibs outside the own window, except champions and spec. starts", () => {
    const check = (partial: Partial<CheckRow>) =>
      outsideCategory(DEFAULT_START_MODEL, RANGES, CHAMPS, row({ runnerId: "r", ...partial }));
    assert.equal(check({ bib: 310 }), false);
    assert.equal(check({ bib: 50 }), true, "A runner in the J window");
    assert.equal(check({ bib: 910 }), true, "A runner in the 2nd start");
    assert.equal(check({ bib: 400 }), false, "champion bib");
    assert.equal(check({ bib: 3, specialKind: "organizer" }), false);
    assert.equal(check({ bib: 3 }), true, "no implicit organizer block (Q220)");
    assert.equal(check({ bib: 650, specialKind: "early" }), false);
    assert.equal(check({ bib: 290, specialKind: "late" }), false);
    assert.equal(check({ bib: 645, specialKind: "with" }), false, "partner in a spec range");
    assert.equal(check({ bib: 910, specialKind: "with" }), true, "partner elsewhere");
    assert.equal(check({ bib: null }), false);
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
