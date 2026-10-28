import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  lineChanges,
  partnerSnapshot,
  partnerTarget,
  startGroupSnapshot,
  startGroupTarget,
  startLineTarget,
  startListTarget,
} from "./startlist";

describe("audit targets", () => {
  it("uses entita:id format", () => {
    assert.equal(startLineTarget(2026, "ABCD1234"), "startlist:2026/ABCD1234");
    assert.equal(startListTarget(2026), "startlist:2026");
    assert.equal(startGroupTarget(7), "start_group:7");
    assert.equal(partnerTarget(3), "partner:3");
  });
});

describe("lineChanges", () => {
  it("records a swap of two bibs with locks", () => {
    assert.deepEqual(
      lineChanges(
        { A: { bib: 10, locked: false }, B: { bib: 20, locked: true } },
        { A: { bib: 20, locked: true }, B: { bib: 10, locked: true } },
      ),
      {
        "A.bib": { before: 10, after: 20 },
        "A.locked": { before: false, after: true },
        "B.bib": { before: 20, after: 10 },
      },
    );
  });

  it("records a move to a free bib and group membership", () => {
    assert.deepEqual(lineChanges({ A: { bib: 10, group: null } }, { A: { bib: 11, group: 4 } }), {
      "A.bib": { before: 10, after: 11 },
      "A.group": { before: null, after: 4 },
    });
  });

  it("returns nothing when nothing changed", () => {
    assert.deepEqual(lineChanges({ A: { bib: 5 } }, { A: { bib: 5 } }), {});
  });
});

describe("snapshots", () => {
  it("lists group members in order", () => {
    assert.deepEqual(startGroupSnapshot({ kind: "joint", note: null, members: ["B", "A"] }), {
      kind: "joint",
      note: null,
      members: "B, A",
    });
  });

  it("omits logo fields that were not touched", () => {
    const base = {
      name: "Sponzor",
      link: null,
      image: null,
      category: 1,
      order: 2,
      active: true,
      description: "",
    };
    assert.deepEqual(Object.keys(partnerSnapshot(base)).sort(), [
      "active",
      "category",
      "description",
      "image",
      "link",
      "name",
      "order",
    ]);
    assert.equal(
      partnerSnapshot({ ...base, logoHash: "abc", logoType: "image/png" }).logoHash,
      "abc",
    );
  });
});
