import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fingerprint,
  isWithinLiveWindow,
  REFRESH_UNCHANGED_MS,
  sanitizeError,
  shouldUpload,
} from "./publisher-core";

const zero = new Date("2026-12-06T09:15:00Z");

test("live window: 2 h before to 5 h after zero", () => {
  assert.ok(isWithinLiveWindow(new Date("2026-12-06T07:15:00Z"), zero));
  assert.ok(isWithinLiveWindow(new Date("2026-12-06T14:15:00Z"), zero));
  assert.ok(!isWithinLiveWindow(new Date("2026-12-06T07:14:59Z"), zero));
  assert.ok(!isWithinLiveWindow(new Date("2026-12-06T14:15:01Z"), zero));
});

test("fingerprint ignores createTime only", () => {
  const a = '<ResultList createTime="2026-12-06T10:00:00+01:00"><x/></ResultList>';
  const b = '<ResultList createTime="2026-12-06T10:00:30+01:00"><x/></ResultList>';
  const c = '<ResultList createTime="2026-12-06T10:00:30+01:00"><y/></ResultList>';
  assert.equal(fingerprint(a), fingerprint(b));
  assert.notEqual(fingerprint(a), fingerprint(c));
});

test("shouldUpload: changed data, forced, or periodic refresh", () => {
  const now = new Date("2026-12-06T10:00:00Z");
  const base = { hash: "h", lastHash: "h", lastOkAt: now, now, force: false };
  assert.equal(shouldUpload(base), false);
  assert.equal(shouldUpload({ ...base, force: true }), true);
  assert.equal(shouldUpload({ ...base, lastHash: "old" }), true);
  assert.equal(shouldUpload({ ...base, lastOkAt: null }), true);
  assert.equal(
    shouldUpload({ ...base, lastOkAt: new Date(now.getTime() - REFRESH_UNCHANGED_MS) }),
    true,
  );
});

test("sanitizeError strips secrets and basic auth", () => {
  const msg = sanitizeError("bad password tajne123 in\nBasic YWJjOmRlZg==", ["tajne123", null]);
  assert.equal(msg, "bad password *** in Basic ***");
  assert.equal(sanitizeError("x".repeat(600), []).length, 500);
});
