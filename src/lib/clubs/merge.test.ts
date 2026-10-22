import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clubPair, planClubMerge } from "./merge";

describe("planClubMerge", () => {
  it("merges the other id under the explicitly chosen main id", () => {
    assert.deepEqual(planClubMerge("CHC", "216", []), {
      ok: true,
      mainId: "CHC",
      rows: [{ clubId: "216", mainClubId: "CHC" }],
    });
  });

  it("stays flat: ids already under the merged id move to the new main id", () => {
    const plan = planClubMerge("CHC", "216", [{ clubId: "601", mainClubId: "216" }]);
    assert.deepEqual(plan, {
      ok: true,
      mainId: "CHC",
      rows: [
        { clubId: "216", mainClubId: "CHC" },
        { clubId: "601", mainClubId: "CHC" },
      ],
    });
  });

  it("refuses same, empty and already merged ids", () => {
    assert.deepEqual(planClubMerge("CHC", "chc", []), { ok: false, error: "same" });
    assert.deepEqual(planClubMerge("", "216", []), { ok: false, error: "empty" });
    const merges = [{ clubId: "216", mainClubId: "CHC" }];
    assert.deepEqual(planClubMerge("216", "PHK", merges), { ok: false, error: "main_merged" });
    assert.deepEqual(planClubMerge("PHK", "216", merges), { ok: false, error: "other_merged" });
  });
});

describe("clubPair", () => {
  it("is order independent", () => {
    assert.deepEqual(clubPair("chc", "216"), ["216", "CHC"]);
    assert.deepEqual(clubPair("216", "CHC"), ["216", "CHC"]);
  });
});
