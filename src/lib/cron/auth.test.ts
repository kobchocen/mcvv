import assert from "node:assert/strict";
import { test } from "node:test";

import { cronAuthorized } from "./auth";

const secret = "x".repeat(40);

test("cronAuthorized requires a long secret and an exact bearer match", () => {
  assert.equal(cronAuthorized(`Bearer ${secret}`, secret), true);
  assert.equal(cronAuthorized(`Bearer ${secret}y`, secret), false);
  assert.equal(cronAuthorized(secret, secret), false);
  assert.equal(cronAuthorized(null, secret), false);
  assert.equal(cronAuthorized("Bearer short", "short"), false);
  assert.equal(cronAuthorized("Bearer ", undefined), false);
});
