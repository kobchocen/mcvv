import assert from "node:assert/strict";
import { test } from "node:test";

import { groupPartners, partnerGroupKey } from "./groups";

test("partner category maps to its homepage group", () => {
  assert.equal(partnerGroupKey(1), "main");
  assert.equal(partnerGroupKey(2), "partners");
  assert.equal(partnerGroupKey(3), "prizes");
  assert.equal(partnerGroupKey(0), "partners");
  assert.equal(partnerGroupKey(7), "partners");
  assert.equal(partnerGroupKey(undefined), "partners");
});

test("groups keep DB order and go main → partners → prizes", () => {
  const groups = groupPartners([
    { name: "A", category: 1 },
    { name: "B", category: 1 },
    { name: "C", category: 2 },
    { name: "D", category: 3 },
    { name: "E", category: 2 },
  ]);
  assert.deepEqual(
    groups.map((group) => [group.key, group.items.map((item) => item.name)]),
    [
      ["main", ["A", "B"]],
      ["partners", ["C", "E"]],
      ["prizes", ["D"]],
    ],
  );
});

test("empty groups are not rendered", () => {
  const groups = groupPartners([
    { name: "A", category: 1 },
    { name: "D", category: 3 },
  ]);
  assert.deepEqual(
    groups.map((group) => group.key),
    ["main", "prizes"],
  );
  assert.deepEqual(groupPartners([]), []);
});
