import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  drawTombola,
  newTombolaSeed,
  parseExcludedClubs,
  parseTombolaCount,
  parseTombolaSeed,
  tombolaClubs,
  type TombolaEntrant,
} from "./tombola-core";

const entrants: TombolaEntrant[] = Array.from({ length: 60 }, (_, i) => ({
  runnerId: `19${String(50 + (i % 50)).padStart(2, "0")}${String(i).padStart(4, "0")}`,
  name: `Běžec ${i}`,
  clubId: i % 4 === 0 ? "CHC" : i % 4 === 1 ? "TJS" : "OKP",
  club: i % 4 === 0 ? "K.O.B. Choceň" : i % 4 === 1 ? "TJ Sokol" : "OK Pardubice",
}));

describe("tombola (#128)", () => {
  it("draws distinct runners outside the excluded clubs", () => {
    const drawn = drawTombola([...entrants, ...entrants.slice(0, 5)], {
      count: 20,
      seed: "abc123",
      excludedClubs: parseExcludedClubs(undefined, false),
    });
    assert.equal(drawn.length, 20);
    assert.equal(new Set(drawn.map((e) => e.runnerId)).size, 20, "no repeats");
    assert.ok(
      drawn.every((e) => e.clubId !== "CHC"),
      "CHC excluded by default",
    );
  });

  it("is stable for the same seed, differs for another, and a larger count only extends", () => {
    const options = { seed: "los1", excludedClubs: new Set<string>() };
    const a = drawTombola(entrants, { ...options, count: 10 }).map((e) => e.runnerId);
    const b = drawTombola([...entrants].reverse(), { ...options, count: 10 }).map(
      (e) => e.runnerId,
    );
    assert.deepEqual(a, b, "input order does not matter");
    const more = drawTombola(entrants, { ...options, count: 15 }).map((e) => e.runnerId);
    assert.deepEqual(more.slice(0, 10), a);
    const other = drawTombola(entrants, { ...options, seed: "los2", count: 10 }).map(
      (e) => e.runnerId,
    );
    assert.notDeepEqual(other, a);
  });

  it("returns everybody when the pool is smaller than the count", () => {
    const drawn = drawTombola(entrants.slice(0, 3), {
      count: 20,
      seed: "x",
      excludedClubs: new Set(),
    });
    assert.equal(drawn.length, 3);
  });

  it("parses parameters defensively", () => {
    assert.equal(parseTombolaCount(undefined), 20);
    assert.equal(parseTombolaCount("5"), 5);
    assert.equal(parseTombolaCount("-1"), 20);
    assert.equal(parseTombolaCount("9999"), 200);
    assert.equal(parseTombolaSeed("AbC12"), "abc12");
    assert.equal(parseTombolaSeed("<script>"), null);
    assert.match(newTombolaSeed(), /^[a-z0-9]{8}$/);
    assert.deepEqual([...parseExcludedClubs([], true)], [], "submitted without boxes = nobody");
    assert.deepEqual([...parseExcludedClubs(["chc", "tjs"], true)], ["CHC", "TJS"]);
    assert.deepEqual(
      tombolaClubs(entrants).map((c) => [c.id, c.count]),
      [
        ["OKP", 30],
        ["CHC", 15],
        ["TJS", 15],
      ],
    );
  });
});
