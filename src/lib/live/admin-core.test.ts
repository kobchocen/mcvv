import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePragueLocal, toPragueLocalInput } from "./admin-core";

test("datetime-local in Prague round trips", () => {
  const date = parsePragueLocal("2026-12-06T10:15");
  assert.deepEqual(date, new Date("2026-12-06T09:15:00.000Z"));
  assert.equal(toPragueLocalInput(date), "2026-12-06T10:15");
  assert.deepEqual(parsePragueLocal("2026-07-01T10:00:30"), new Date("2026-07-01T08:00:30.000Z"));
  assert.equal(parsePragueLocal("2026-13-01T10:00"), null);
  assert.equal(parsePragueLocal("nonsense"), null);
  assert.equal(parsePragueLocal(""), null);
  assert.equal(toPragueLocalInput(null), "");
});
