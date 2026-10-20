import assert from "node:assert/strict";
import { test } from "node:test";

import { canManageLiveResults, canAccessSplits, hasRole } from "./roles";

test("splits client is open to splitmaker, organizer and admin only", () => {
  assert.ok(canAccessSplits({ role: "splitmaker" }));
  assert.ok(canAccessSplits({ role: "organizer" }));
  assert.ok(canAccessSplits({ role: "admin" }));
  assert.ok(!canAccessSplits({ role: "registrar" }));
  assert.ok(!canAccessSplits({ role: "timing" }));
  assert.ok(!canAccessSplits(null));
  assert.ok(!canAccessSplits(undefined));
});

test("race day management is admin only", () => {
  assert.ok(canManageLiveResults({ role: "admin" }));
  assert.ok(!canManageLiveResults({ role: "organizer" }));
  assert.ok(!canManageLiveResults({ role: "splitmaker" }));
  assert.ok(!hasRole({ role: "admin" }));
});
