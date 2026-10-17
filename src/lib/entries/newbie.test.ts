import assert from "node:assert/strict";
import { test } from "node:test";

import { isNewbie } from "./newbie";

test("newbie only without past results and without past entries", () => {
  assert.equal(isNewbie(0, false), true);
  assert.equal(isNewbie(0, true), false);
  assert.equal(isNewbie(2, false), false);
  assert.equal(isNewbie(3, true), false);
});
