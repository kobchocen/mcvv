import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearableSplits,
  clearBlocked,
  confirmationMatches,
  formatClearSource,
  parseClearFilter,
  parseClearSource,
  snapshotRows,
  splitRowKey,
} from "./clear-core";

test("parseClearSource accepts all, web, obd and token ids only", () => {
  assert.deepEqual(parseClearSource(undefined), { kind: "all" });
  assert.deepEqual(parseClearSource(""), { kind: "all" });
  assert.deepEqual(parseClearSource("web"), { kind: "source", source: "web" });
  assert.deepEqual(parseClearSource("obd"), { kind: "source", source: "obd" });
  assert.deepEqual(parseClearSource("token:12"), { kind: "token", tokenId: 12 });
  assert.equal(parseClearSource("token:0"), null);
  assert.equal(parseClearSource("token:abc"), null);
  assert.deepEqual(parseClearSource("admin"), { kind: "source", source: "admin" });
  assert.equal(parseClearSource("lum"), null);
  assert.equal(formatClearSource({ kind: "token", tokenId: 3 }), "token:3");
});

test("parseClearFilter: empty selection = all offered splits, unknown split rejected", () => {
  const allowed = clearableSplits([
    { code: "3", label: "2,7 km" },
    { code: "1", label: "1,3 km" },
  ]);
  assert.deepEqual(allowed, ["1", "3", "9"]);
  assert.deepEqual(parseClearFilter({ splits: [], source: "all" }, allowed), {
    splits: ["1", "3", "9"],
    source: { kind: "all" },
  });
  assert.deepEqual(parseClearFilter({ splits: ["9", "1", "9"], source: "obd" }, allowed), {
    splits: ["1", "9"],
    source: { kind: "source", source: "obd" },
  });
  assert.equal(parseClearFilter({ splits: ["5"], source: "all" }, allowed), null);
  assert.equal(parseClearFilter({ splits: ["x"], source: "all" }, allowed), null);
  assert.equal(parseClearFilter({ splits: ["1"], source: "nope" }, allowed), null);
});

test("confirmation must be exactly the year", () => {
  assert.equal(confirmationMatches("2026", 2026), true);
  assert.equal(confirmationMatches(" 2026 ", 2026), true);
  assert.equal(confirmationMatches("2025", 2026), false);
  assert.equal(confirmationMatches("", 2026), false);
  assert.equal(confirmationMatches(null, 2026), false);
});

test("Q32: bulk clear is blocked from the official zero on, allowed before", () => {
  const zero = new Date("2026-12-06T09:15:00.000Z"); // 10:15 Europe/Prague
  assert.equal(clearBlocked(new Date("2026-12-06T09:14:59.999Z"), zero), false);
  assert.equal(clearBlocked(new Date("2026-12-06T06:00:00.000Z"), zero), false);
  assert.equal(clearBlocked(zero, zero), true);
  assert.equal(clearBlocked(new Date("2026-12-07T12:00:00.000Z"), zero), true);
});

test("snapshotRows is compact and sorted by split then bib", () => {
  const created = new Date("2026-12-06T09:40:00.000Z");
  assert.deepEqual(
    snapshotRows([
      { bib: 41, split: "9", time: 1686, author: "LuM", created },
      { bib: 7, split: "1", time: 300, author: "spl1", created: null },
      { bib: 3, split: "9", time: 1500, author: null, created },
    ]),
    [
      [7, "1", 300, "spl1", null],
      [3, "9", 1500, null, created.toISOString()],
      [41, "9", 1686, "LuM", created.toISOString()],
    ],
  );
  assert.equal(splitRowKey({ split: "9", bib: 41, time: 1686 }), "9:41:1686");
});
