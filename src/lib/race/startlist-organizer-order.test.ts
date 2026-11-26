import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareOrganizerOrder,
  deriveOrganizerTieSeed,
  organizerSetKey,
  organizerTieHash,
  sortOrganizers,
} from "./startlist-organizer-order";

const ORG = { kind: "organizer" as const };

describe("organizerSetKey and deriveOrganizerTieSeed", () => {
  it("is stable for the same set regardless of order, and changes when the set changes", () => {
    const a = [
      { runnerId: "R2", eligible: true, special: ORG },
      { runnerId: "R1", eligible: true, special: ORG },
    ];
    const b = [
      { runnerId: "R1", eligible: true, special: ORG },
      { runnerId: "R2", eligible: true, special: ORG },
    ];
    assert.equal(organizerSetKey(a), "R1,R2");
    assert.equal(organizerSetKey(a), organizerSetKey(b));
    assert.equal(
      deriveOrganizerTieSeed(organizerSetKey(a)),
      deriveOrganizerTieSeed(organizerSetKey(b)),
    );
    const c = [...b, { runnerId: "R3", eligible: true, special: ORG }];
    assert.notEqual(organizerSetKey(c), organizerSetKey(a));
    assert.notEqual(
      deriveOrganizerTieSeed(organizerSetKey(c)),
      deriveOrganizerTieSeed(organizerSetKey(a)),
    );
  });
  it("ignores ineligible organisers and non-organisers", () => {
    const key = organizerSetKey([
      { runnerId: "R1", eligible: true, special: ORG },
      { runnerId: "R2", eligible: false, special: ORG },
      { runnerId: "R3", eligible: true, special: { kind: "early" } },
      { runnerId: "R4", eligible: true, special: null },
    ]);
    assert.equal(key, "R1");
  });
});

describe("sortOrganizers", () => {
  it("orders by completed editions descending", () => {
    const seed = deriveOrganizerTieSeed("A,B,C");
    const sorted = sortOrganizers(
      [
        { runnerId: "A", editionsCount: 1 },
        { runnerId: "B", editionsCount: 10 },
        { runnerId: "C", editionsCount: 4 },
      ],
      seed,
    );
    assert.deepEqual(
      sorted.map((row) => row.runnerId),
      ["B", "C", "A"],
    );
  });
  it("breaks ties with a deterministic seed and stays stable for the same seed", () => {
    const entries = [
      { runnerId: "AAA0001", editionsCount: 5 },
      { runnerId: "BBB0001", editionsCount: 5 },
      { runnerId: "CCC0001", editionsCount: 5 },
    ];
    const seed = deriveOrganizerTieSeed("AAA0001,BBB0001,CCC0001");
    const first = sortOrganizers(entries, seed).map((row) => row.runnerId);
    const second = sortOrganizers([...entries].reverse(), seed).map((row) => row.runnerId);
    assert.deepEqual(first, second);
    assert.equal(new Set(first).size, 3);
    // jiný seed může pořadí shod změnit (hash není identita)
    const other = deriveOrganizerTieSeed("other");
    const hashes = entries.map((row) => organizerTieHash(seed, row.runnerId));
    assert.equal(new Set(hashes).size, 3);
    assert.ok(typeof compareOrganizerOrder(entries[0], entries[1], other) === "number");
  });
});
