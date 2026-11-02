import assert from "node:assert/strict";
import { test } from "node:test";

import { starterAccess, starterBatchSchema } from "./starter-api-core";

test("starter sees only the assigned corridor", () => {
  assert.deepEqual(starterAccess("starter", 2, "1"), {
    ok: true,
    corridor: 2,
    allowed: 2,
    canSwitch: false,
  });
  assert.deepEqual(starterAccess("starter", null, "1"), { ok: false, error: "no-corridor" });
});

test("admin and organizer can switch corridors", () => {
  assert.deepEqual(starterAccess("admin", null, "2"), {
    ok: true,
    corridor: 2,
    allowed: null,
    canSwitch: true,
  });
  assert.deepEqual(starterAccess("organizer", 2, undefined), {
    ok: true,
    corridor: 2,
    allowed: null,
    canSwitch: true,
  });
  assert.deepEqual(starterAccess("admin", null, "x"), {
    ok: true,
    corridor: 1,
    allowed: null,
    canSwitch: true,
  });
});

test("other roles are refused", () => {
  for (const role of ["registrar", "timing", "splitmaker", "race_office"] as const) {
    assert.deepEqual(starterAccess(role, 1, "1"), { ok: false, error: "forbidden" });
  }
});

test("batch schema", () => {
  const entry = { id: "0d4f6c9e-1111-4c1b-9a51-2f6d1c2a3b4c", bib: 12, action: "mark", at: 1 };
  assert.equal(starterBatchSchema.safeParse({ entries: [entry] }).success, true);
  assert.equal(starterBatchSchema.safeParse({ entries: [] }).success, false);
  assert.equal(
    starterBatchSchema.safeParse({ entries: [{ ...entry, action: "delete" }] }).success,
    false,
  );
  assert.equal(starterBatchSchema.safeParse({ entries: [{ ...entry, bib: 0 }] }).success, false);
  assert.equal(starterBatchSchema.safeParse({ entries: [{ ...entry, id: "x" }] }).success, false);
});
