import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyBibKey,
  BIB_KEYPAD_KEYS,
  bibInputMode,
  isBibBackspaceKey,
  isBibClearEvent,
  isBibSubmitKey,
} from "./splits-input";

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

test("on-screen keypad puts backspace bottom-left and Enter bottom-right", () => {
  assert.deepEqual(
    [...BIB_KEYPAD_KEYS],
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Backspace", "0", "Enter"],
  );
  assert.equal(BIB_KEYPAD_KEYS[9], "Backspace");
  assert.equal(BIB_KEYPAD_KEYS[10], "0");
  assert.equal(BIB_KEYPAD_KEYS[11], "Enter");
  assert.equal(isBibSubmitKey(BIB_KEYPAD_KEYS[11]), true);
  assert.equal(isBibBackspaceKey(BIB_KEYPAD_KEYS[9]), true);
  assert.equal(isBibBackspaceKey("⌫"), true);
  assert.equal(isBibBackspaceKey("Enter"), false);
});

test("isBibClearEvent: Escape clears unless another text field is focused", () => {
  assert.equal(isBibClearEvent({ key: "Escape" }), true);
  assert.equal(isBibClearEvent({ key: "Escape", target: { tagName: "BUTTON" } }), true);
  assert.equal(isBibClearEvent({ key: "Escape", target: { id: "bib", tagName: "INPUT" } }), true);
  assert.equal(
    isBibClearEvent({ key: "Escape", target: { id: "edit-bib", tagName: "INPUT" } }),
    false,
  );
  assert.equal(isBibClearEvent({ key: "Escape", target: { tagName: "TEXTAREA" } }), false);
  assert.equal(isBibClearEvent({ key: "Escape", target: { isContentEditable: true } }), false);
  assert.equal(
    isBibClearEvent({ key: "Backspace", target: { id: "bib", tagName: "INPUT" } }),
    false,
  );
  assert.equal(isBibClearEvent({ key: "Enter" }), false);
});
