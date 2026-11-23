import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearableSplits,
  clearBlocked,
  clearsFinishRecords,
  confirmationMatches,
  formatClearSource,
  parseClearFilter,
  parseClearSource,
  snapshotFinishBibs,
  snapshotFinishPunches,
  snapshotRows,
  splitRowKey,
} from "./clear-core";

test("parseClearSource accepts all, web, obd and admin only", () => {
  assert.deepEqual(parseClearSource(undefined), { kind: "all" });
  assert.deepEqual(parseClearSource(""), { kind: "all" });
  assert.deepEqual(parseClearSource("web"), { kind: "source", source: "web" });
  assert.deepEqual(parseClearSource("obd"), { kind: "source", source: "obd" });
  assert.equal(parseClearSource("token:12"), null);
  assert.equal(parseClearSource("token:0"), null);
  assert.equal(parseClearSource("token:abc"), null);
  assert.deepEqual(parseClearSource("admin"), { kind: "source", source: "admin" });
  assert.equal(parseClearSource("lum"), null);
  assert.equal(formatClearSource({ kind: "all" }), "all");
  assert.equal(formatClearSource({ kind: "source", source: "obd" }), "obd");
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

test("#366: finish station records are cleared only with the finish and source all", () => {
  assert.equal(clearsFinishRecords({ splits: ["1", "3", "9"], source: { kind: "all" } }), true);
  assert.equal(clearsFinishRecords({ splits: ["9"], source: { kind: "all" } }), true);
  assert.equal(clearsFinishRecords({ splits: ["1", "3"], source: { kind: "all" } }), false);
  assert.equal(
    clearsFinishRecords({ splits: ["9"], source: { kind: "source", source: "web" } }),
    false,
  );
  assert.equal(
    clearsFinishRecords({ splits: ["1", "9"], source: { kind: "source", source: "admin" } }),
    false,
  );
  // výchozí výběr z formuláře (nic nezaškrtnuto) = všechny splity včetně cíle
  const allowed = clearableSplits([{ code: "1", label: "1,3 km" }]);
  assert.equal(
    clearsFinishRecords(parseClearFilter({ splits: [], source: "all" }, allowed)!),
    true,
  );
});

test("#366: finish snapshots are compact, keep soft-deleted rows and sort by time / order", () => {
  const created = new Date("2026-12-06T09:00:00.000Z");
  const t1 = new Date("2026-12-06T09:40:01.250Z");
  const t2 = new Date("2026-12-06T09:41:00.000Z");
  assert.deepEqual(
    snapshotFinishPunches([
      {
        entryKey: "b",
        punchedAt: t2,
        source: "watch",
        deleted: true,
        note: "dvojklik",
        userId: 5,
        createdAt: created,
      },
      {
        entryKey: "a",
        punchedAt: t1,
        source: "admin",
        deleted: false,
        note: null,
        userId: null,
        createdAt: created,
      },
    ]),
    [
      ["a", t1.toISOString(), "admin", 0, null, null, created.toISOString()],
      ["b", t2.toISOString(), "watch", 1, "dvojklik", 5, created.toISOString()],
    ],
  );
  assert.deepEqual(
    snapshotFinishBibs([
      {
        entryKey: "y",
        bib: 41,
        readAt: t2,
        sortKey: 2.5,
        source: "bibs",
        deleted: false,
        note: null,
        userId: 7,
        createdAt: created,
      },
      {
        entryKey: "x",
        bib: 3,
        readAt: t1,
        sortKey: 1,
        source: "bibs",
        deleted: true,
        note: "překlep",
        userId: 7,
        createdAt: created,
      },
    ]),
    [
      ["x", 3, t1.toISOString(), 1, "bibs", 1, "překlep", 7, created.toISOString()],
      ["y", 41, t2.toISOString(), 2.5, "bibs", 0, null, 7, created.toISOString()],
    ],
  );
  assert.deepEqual(snapshotFinishPunches([]), []);
  assert.deepEqual(snapshotFinishBibs([]), []);
});
