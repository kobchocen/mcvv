import assert from "node:assert/strict";
import { test } from "node:test";

import { resultsHashScrollBlock } from "./hash-scroll";

test("category and team-competition hashes scroll to the start of the section", () => {
  assert.equal(resultsHashScrollBlock("cat-A"), "start");
  assert.equal(resultsHashScrollBlock("cat-J"), "start");
  assert.equal(resultsHashScrollBlock("soutez-tymu"), "start");
  assert.equal(resultsHashScrollBlock("soutez-tymu-title"), "start");
});

test("runner-row hashes keep a centered highlight scroll", () => {
  assert.equal(resultsHashScrollBlock("19960016"), "center");
  assert.equal(resultsHashScrollBlock("20110008"), "center");
});
