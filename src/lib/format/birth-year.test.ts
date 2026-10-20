import assert from "node:assert/strict";
import { test } from "node:test";

import { shortBirthYear } from "./birth-year";

test("short birth year for the mobile results table", () => {
  assert.equal(shortBirthYear("2007"), "’07");
  assert.equal(shortBirthYear("1983"), "’83");
  assert.equal(shortBirthYear("—"), "—");
  assert.equal(shortBirthYear(""), "");
});
