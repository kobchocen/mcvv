import assert from "node:assert/strict";
import { test } from "node:test";

import { stepLightboxIndex } from "./lightbox";

test("stepLightboxIndex moves within bounds", () => {
  assert.equal(stepLightboxIndex(0, 3, 1), 1);
  assert.equal(stepLightboxIndex(2, 3, -1), 1);
});

test("stepLightboxIndex stops at ends without wrap", () => {
  assert.equal(stepLightboxIndex(0, 3, -1), null);
  assert.equal(stepLightboxIndex(2, 3, 1), null);
});

test("stepLightboxIndex wraps around when enabled", () => {
  assert.equal(stepLightboxIndex(0, 3, -1, true), 2);
  assert.equal(stepLightboxIndex(2, 3, 1, true), 0);
});

test("stepLightboxIndex ignores single photo and invalid index", () => {
  assert.equal(stepLightboxIndex(0, 1, 1, true), null);
  assert.equal(stepLightboxIndex(0, 0, 1), null);
  assert.equal(stepLightboxIndex(5, 3, -1), null);
});
