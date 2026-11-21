import assert from "node:assert/strict";
import { test } from "node:test";

import { isoWithOffset } from "./iso-offset";

test("isoWithOffset uses the Prague offset (winter +01:00, summer +02:00)", () => {
  assert.equal(isoWithOffset(new Date("2026-12-06T09:15:00.000Z")), "2026-12-06T10:15:00+01:00");
  assert.equal(isoWithOffset(new Date("2026-07-01T08:00:00Z")), "2026-07-01T10:00:00+02:00");
  assert.equal(isoWithOffset(new Date("2026-07-01T08:00:00Z"), "UTC"), "2026-07-01T08:00:00+00:00");
});
