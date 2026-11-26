import assert from "node:assert/strict";
import { test } from "node:test";

import { applyBibKey, bibInputMode, isBibSubmitKey } from "./splits-input";

test("bibInputMode hides the OS keyboard only on coarse pointers", () => {
  assert.equal(bibInputMode(true), "none");
  assert.equal(bibInputMode(false), "numeric");
});

test("applyBibKey appends digits, strips leading zeros and caps length", () => {
  assert.equal(applyBibKey("", "1"), "1");
  assert.equal(applyBibKey("1", "0"), "10");
  assert.equal(applyBibKey("10", "4"), "104");
  assert.equal(applyBibKey("104", "5"), "104");
  assert.equal(applyBibKey("", "0"), "");
  assert.equal(applyBibKey("", "0") + applyBibKey("", "7"), "7");
  assert.equal(applyBibKey("", "7"), "7");
});

test("applyBibKey clears, deletes and ignores submit or junk keys", () => {
  assert.equal(applyBibKey("12", "C"), "");
  assert.equal(applyBibKey("12", "Escape"), "");
  assert.equal(applyBibKey("12", "⌫"), "1");
  assert.equal(applyBibKey("12", "Backspace"), "1");
  assert.equal(applyBibKey("12", "OK"), "12");
  assert.equal(applyBibKey("12", "Enter"), "12");
  assert.equal(applyBibKey("12", "a"), "12");
  assert.equal(applyBibKey("12", "."), "12");
});

test("isBibSubmitKey recognizes Enter and the on-screen OK", () => {
  assert.equal(isBibSubmitKey("Enter"), true);
  assert.equal(isBibSubmitKey("OK"), true);
  assert.equal(isBibSubmitKey("1"), false);
  assert.equal(isBibSubmitKey("Backspace"), false);
});
