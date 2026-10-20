import assert from "node:assert/strict";
import { test } from "node:test";

import { isPromotionOptOut, promotionValue } from "./promotion";

test("isPromotionOptOut: only N (trimmed, any case) opts out", () => {
  assert.equal(isPromotionOptOut("N"), true);
  assert.equal(isPromotionOptOut(" n "), true);
  assert.equal(isPromotionOptOut(null), false);
  assert.equal(isPromotionOptOut(undefined), false);
  assert.equal(isPromotionOptOut(""), false);
  assert.equal(isPromotionOptOut("  "), false);
  assert.equal(isPromotionOptOut("A"), false);
  assert.equal(isPromotionOptOut("NE"), false);
});

test("promotionValue: checkbox maps to N / NULL", () => {
  assert.equal(promotionValue(true), "N");
  assert.equal(promotionValue(false), null);
});

test("promotionValue round-trips through isPromotionOptOut", () => {
  for (const checked of [true, false]) {
    assert.equal(isPromotionOptOut(promotionValue(checked)), checked);
  }
});
