import assert from "node:assert/strict";
import test from "node:test";

import { latePaidMailDedupeKey, pickLateBib, pickLateBibs } from "./late-bib-core";

const range = { bibFrom: 101, bibTo: 105 };

test("late bib: random free number inside the category range (Q326)", () => {
  const taken = new Set([101, 103]);
  assert.deepEqual(
    pickLateBib(range, taken, () => 0),
    { bib: 102, outsideCategory: false },
  );
  assert.deepEqual(
    pickLateBib(range, taken, () => 0.5),
    { bib: 104, outsideCategory: false },
  );
  assert.deepEqual(
    pickLateBib(range, taken, () => 0.999),
    { bib: 105, outsideCategory: false },
  );
});

test("late bib: full category → nearest free lower number outside the category", () => {
  const taken = new Set([101, 102, 103, 104, 105, 100, 99]);
  assert.deepEqual(pickLateBib(range, taken), { bib: 98, outsideCategory: true });
});

test("late bib: nothing free below → no number", () => {
  const taken = new Set([1, 2, 3]);
  assert.equal(pickLateBib({ bibFrom: 1, bibTo: 3 }, taken), null);
  assert.equal(pickLateBib(null, new Set()), null);
  assert.equal(pickLateBib({ bibFrom: 10, bibTo: 5 }, new Set()), null);
});

test("late bibs: two runners never get the same number, existing bibs kept", () => {
  const ranges = [
    { categoryId: "A", bibFrom: 1, bibTo: 2 },
    { categoryId: "B", bibFrom: 10, bibTo: 10 },
  ];
  const picks = pickLateBibs(
    [
      { runnerId: "r1", categoryId: "A", bib: null },
      { runnerId: "r2", categoryId: "A", bib: null },
      { runnerId: "r3", categoryId: "B", bib: 10 },
      { runnerId: "r4", categoryId: "B", bib: null },
    ],
    ranges,
    new Set([10]),
    () => 0,
  );
  assert.deepEqual(picks, [
    { runnerId: "r1", pick: { bib: 1, outsideCategory: false } },
    { runnerId: "r2", pick: { bib: 2, outsideCategory: false } },
    { runnerId: "r4", pick: { bib: 9, outsideCategory: true } },
  ]);
});

test("late paid mail dedupe key", () => {
  assert.equal(latePaidMailDedupeKey(2026, 412), "late-paid:2026:412");
});
