import assert from "node:assert/strict";
import { test } from "node:test";
import { GET } from "./route";

test("liveness is plain ok, uncacheable and independent of the database", async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(await response.text(), "ok");
});
