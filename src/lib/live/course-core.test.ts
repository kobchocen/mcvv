import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { courseOverview } from "./course-core";
import type { Station } from "./stations";

const stations: Station[] = [
  { code: "3", label: "2,7 km", position: 27, public: true },
  { code: "1", label: "1,3 km", position: 13, public: true },
  { code: "a", label: "2,0 km", position: 20, public: false },
];
const runner = (bib: number) => ({ bib, name: `B${bib}`, categoryId: "A" });

describe("course overview (#316)", () => {
  it("counts passages in course order and flags skipped checkpoints", () => {
    const runners = [1, 2, 3, 4, 5].map(runner);
    const splits = [
      { bib: 1, split: "1" },
      { bib: 1, split: "a" },
      { bib: 1, split: "3" },
      { bib: 1, split: "9" },
      { bib: 2, split: "1" },
      { bib: 2, split: "3" },
      { bib: 3, split: "9" },
      { bib: 4, split: "1" },
      { bib: 99, split: "1" },
    ];
    const o = courseOverview(stations, runners, splits, new Set([5]));
    assert.deepEqual(
      o.points.map((p) => [p.code, p.passed]),
      [
        ["1", 3],
        ["a", 1],
        ["3", 2],
      ],
    );
    assert.equal(o.roster, 5);
    assert.equal(o.started, 5);
    assert.equal(o.finished, 2);
    assert.equal(o.anyCheckpoint, 3);
    assert.deepEqual(
      o.skips.map((s) => [s.bib, s.at, s.missing]),
      [
        [2, "3", ["a"]],
        [3, "9", ["1", "a", "3"]],
      ],
    );
  });
  it("first checkpoint alone is never a skip", () => {
    const o = courseOverview(stations, [runner(1)], [{ bib: 1, split: "1" }], new Set());
    assert.deepEqual(o.skips, []);
  });
});
