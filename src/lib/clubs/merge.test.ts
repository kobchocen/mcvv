import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planClubMerge, uniqueClubSlug } from "./merge";

describe("planClubMerge", () => {
  it("creates, attaches, joins or does nothing", () => {
    assert.deepEqual(planClubMerge(null, null), { kind: "create" });
    assert.deepEqual(planClubMerge(3, null), { kind: "attach", clubId: 3 });
    assert.deepEqual(planClubMerge(null, 4), { kind: "attach", clubId: 4 });
    assert.deepEqual(planClubMerge(3, 4), { kind: "join", into: 3, from: 4 });
    assert.deepEqual(planClubMerge(5, 5), { kind: "noop", clubId: 5 });
  });
});

describe("uniqueClubSlug", () => {
  it("adds a number when the slug is taken", () => {
    assert.equal(uniqueClubSlug("K.O.B. Choceň", new Set()), "k-o-b-chocen");
    assert.equal(uniqueClubSlug("K.O.B. Choceň", new Set(["k-o-b-chocen"])), "k-o-b-chocen-2");
    assert.equal(
      uniqueClubSlug("K.O.B. Choceň", new Set(["k-o-b-chocen", "k-o-b-chocen-2"])),
      "k-o-b-chocen-3",
    );
    assert.equal(uniqueClubSlug("…", new Set()), "klub");
  });
});
