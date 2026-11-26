import assert from "node:assert/strict";
import { test } from "node:test";

import { resultboardApiReject } from "./resultboard-access";

test("resultboard API refuses anonymous callers with 401", () => {
  assert.equal(resultboardApiReject(false, false), 401);
  assert.equal(resultboardApiReject(false, true), 401);
});

test("resultboard API refuses a signed-in account without the screen permission", () => {
  assert.equal(resultboardApiReject(true, false), 403);
});

test("resultboard API lets a signed-in organizer or admin through", () => {
  assert.equal(resultboardApiReject(true, true), null);
});
