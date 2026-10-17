import assert from "node:assert/strict";
import { test } from "node:test";

import { isNewbie } from "./newbie";

test("newbie = no result in any other year", () => {
  assert.equal(isNewbie(0), true);
  assert.equal(isNewbie(1), false);
  assert.equal(isNewbie(14), false);
});
