import assert from "node:assert/strict";
import { test } from "node:test";

import { detailLine, pickSplits, splitsLine, yearHasSplits } from "./table";

const labels = { split1: "M1", split2: "M2" };

test("pickSplits takes split 1 and 3 and ignores the rest", () => {
  assert.deepEqual(
    pickSplits([
      { split: "3", time: 1501 },
      { split: "1", time: 754 },
      { split: "9", time: 2000 },
    ]),
    { split1: 754, split2: 1501 },
  );
  assert.deepEqual(pickSplits([]), { split1: null, split2: null });
});

test("splitsLine lists only the splits a runner has", () => {
  assert.equal(splitsLine({ split1: 754, split2: 1501 }, labels), "M1 12:34 · M2 25:01");
  assert.equal(splitsLine({ split1: null, split2: 1501 }, labels), "M2 25:01");
  assert.equal(splitsLine({ split1: null, split2: null }, labels), "");
});

test("detailLine appends the category with rank in the overall view", () => {
  assert.equal(detailLine("SK Chocen"), "SK Chocen");
  assert.equal(detailLine("SK Chocen", "M40 (3.)"), "SK Chocen · M40 (3.)");
});

test("yearHasSplits hides the toggle for years without split data", () => {
  assert.equal(yearHasSplits(0), false);
  assert.equal(yearHasSplits(12), true);
});
