import assert from "node:assert/strict";
import { test } from "node:test";

import { validatePullRequest } from "./policy.mjs";

test("allows a working branch into develop", () => {
  assert.doesNotThrow(() => validatePullRequest("feature/souteze-tymu-results", "develop"));
});

test("allows a stacked working branch onto another working branch", () => {
  assert.doesNotThrow(() =>
    validatePullRequest("feature/souteze-tymu-page", "feature/souteze-tymu-results"),
  );
  assert.doesNotThrow(() =>
    validatePullRequest("feature/souteze-tymu-live", "feature/souteze-tymu-page"),
  );
});

test("rejects a feature branch directly into main", () => {
  assert.throws(
    () => validatePullRequest("feature/souteze-tymu-results", "main"),
    /Production accepts release\/\* or hotfix\/\*/,
  );
});
