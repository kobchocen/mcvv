import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkPunch,
  decideDeviceDelete,
  decideDeviceWrite,
  decideWrite,
  deviceBatchSchema,
  deviceEntryKey,
  nextDeviceEntryKey,
  sameOrigin,
  summarize,
  webBatchSchema,
} from "./ingest-core";

const now = new Date("2026-12-06T10:00:00.000Z");
const start = new Date("2026-12-06T09:30:00.000Z");

test("decideWrite: web keeps the first entry, OBD reports conflicts", () => {
  assert.equal(decideWrite(null, 100, "web"), "insert");
  assert.equal(decideWrite({ time: 100 }, 100, "web"), "duplicate");
  assert.equal(decideWrite({ time: 100 }, 120, "web"), "duplicate");
  assert.equal(decideWrite(null, 100, "obd"), "insert");
  assert.equal(decideWrite({ time: 100 }, 100, "obd"), "unchanged");
  assert.equal(decideWrite({ time: 100 }, 101, "obd"), "conflict");
});

test("checkPunch computes seconds since start and rejects nonsense", () => {
  assert.deepEqual(checkPunch(start.getTime() + 61_900, start, now), { ok: true, time: 61 });
  assert.deepEqual(checkPunch(start.getTime() - 1000, start, now), {
    ok: false,
    reason: "before-start",
  });
  assert.deepEqual(checkPunch(now.getTime() + 5 * 60_000, start, now), {
    ok: false,
    reason: "future",
  });
  assert.deepEqual(checkPunch(now.getTime() - 25 * 3600_000, start, now), {
    ok: false,
    reason: "stale",
  });
  const lateStart = new Date(now.getTime() - 7 * 3600_000);
  assert.deepEqual(checkPunch(now.getTime(), lateStart, now), { ok: false, reason: "too-long" });
});

test("web batch schema", () => {
  const ok = webBatchSchema.safeParse({
    entries: [
      {
        action: "create",
        id: "0b6f1c1e-1111-4a4a-9d9d-000000000001",
        split: "1",
        bib: 41,
        punchedAt: 1,
      },
      {
        action: "correct",
        id: "0b6f1c1e-1111-4a4a-9d9d-000000000002",
        replaces: "0b6f1c1e-1111-4a4a-9d9d-000000000001",
        split: "1",
        bib: 42,
        punchedAt: 1,
      },
      {
        action: "delete",
        id: "0b6f1c1e-1111-4a4a-9d9d-000000000003",
        replaces: "0b6f1c1e-1111-4a4a-9d9d-000000000002",
        split: "1",
      },
    ],
  });
  assert.ok(ok.success);
  assert.ok(!webBatchSchema.safeParse({ entries: [] }).success);
  assert.ok(
    !webBatchSchema.safeParse({
      entries: [{ action: "create", id: "short", split: "1", bib: 1, punchedAt: 1 }],
    }).success,
  );
  assert.ok(
    !webBatchSchema.safeParse({
      entries: [{ action: "create", id: "abcdefgh-1", split: "0", bib: 1, punchedAt: 1 }],
    }).success,
  );
});

test("device batch schema defaults to the finish split", () => {
  const parsed = deviceBatchSchema.parse({ items: [{ bib: 141, timeS: 1686 }] });
  assert.equal(parsed.items[0].split, "9");
  assert.ok(!deviceBatchSchema.safeParse({ items: [{ bib: 1000, timeS: 1 }] }).success);
  assert.ok(!deviceBatchSchema.safeParse({ items: [{ bib: 1, timeS: -1 }] }).success);
  assert.equal(deviceEntryKey(3, { bib: 141, split: "9", timeS: 1686 }), "dev3:9:141:1686");
});

test("summary and same-origin check", () => {
  assert.deepEqual(summarize(["applied", "applied", "conflict"]), { applied: 2, conflict: 1 });
  assert.ok(sameOrigin("https://mcvv.org", "mcvv.org"));
  assert.ok(sameOrigin("http://localhost:3104", "localhost:3104"));
  assert.ok(!sameOrigin("https://evil.example", "mcvv.org"));
  assert.ok(!sameOrigin(null, "mcvv.org"));
  assert.ok(!sameOrigin("not a url", "mcvv.org"));
});

test("device items default to set and accept delete (OBD snapshot)", () => {
  const parsed = deviceBatchSchema.parse({
    items: [
      { bib: 141, timeS: 1686 },
      { action: "delete", bib: 142, timeS: 1700 },
    ],
  });
  assert.equal(parsed.items[0]!.action, "set");
  assert.equal(parsed.items[1]!.action, "delete");
  assert.ok(!deviceBatchSchema.safeParse({ items: [{ action: "x", bib: 1, timeS: 1 }] }).success);
  assert.equal(
    deviceEntryKey(3, { action: "delete", bib: 141, split: "9", timeS: 1686 }),
    "dev3:del:9:141:1686",
  );
});

test("decideDeviceWrite: OBD corrections overwrite only OBD values", () => {
  assert.equal(decideDeviceWrite(null, 100), "insert");
  assert.equal(decideDeviceWrite({ time: 100, ownedByObd: true }, 100), "unchanged");
  assert.equal(decideDeviceWrite({ time: 100, ownedByObd: false }, 100), "unchanged");
  assert.equal(decideDeviceWrite({ time: 100, ownedByObd: true }, 101), "replace");
  assert.equal(decideDeviceWrite({ time: 100, ownedByObd: false }, 101), "conflict");
});

test("decideDeviceDelete: removed row deletes only the unchanged OBD value", () => {
  assert.equal(decideDeviceDelete(null, 100), "missing");
  assert.equal(decideDeviceDelete({ time: 101, ownedByObd: true }, 100), "missing");
  assert.equal(decideDeviceDelete({ time: 100, ownedByObd: false }, 100), "not-owned");
  assert.equal(decideDeviceDelete({ time: 100, ownedByObd: true }, 100), "delete");
});

test("nextDeviceEntryKey numbers re-sent values after delete/replace", () => {
  assert.equal(nextDeviceEntryKey("dev3:9:141:1686", []), "dev3:9:141:1686");
  assert.equal(nextDeviceEntryKey("dev3:9:141:1686", ["dev3:9:141:1686"]), "dev3:9:141:1686#2");
  assert.equal(
    nextDeviceEntryKey("dev3:9:141:1686", [
      "dev3:9:141:1686#2",
      "dev3:9:141:1686",
      "dev3:9:141:16860",
    ]),
    "dev3:9:141:1686#3",
  );
});
