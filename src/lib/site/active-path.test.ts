import assert from "node:assert/strict";
import { test } from "node:test";

import { isActivePath } from "./active-path";

test("menu Statistiky is active on the landing page and on every statistics subpage", () => {
  assert.equal(isActivePath("/cs/statistiky", "/statistiky"), true);
  assert.equal(isActivePath("/en/statistiky/rekordy", "/statistiky"), true);
  assert.equal(isActivePath("/cs/statistikyx", "/statistiky"), false);
  assert.equal(isActivePath("/cs/results", "/statistiky"), false);
});

test("home is active only on the locale root; homepage anchors never", () => {
  assert.equal(isActivePath("/cs", "/"), true);
  assert.equal(isActivePath("/cs/program", "/"), false);
  assert.equal(isActivePath("/cs", "#about"), false);
});
