import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BuildVersion } from "../components/atoms/build-version";
import { GET } from "../app/api/version/route";
import info from "./build-info.json";
import {
  releaseIdentity,
  validateBranch,
  validatePullRequest,
} from "../../scripts/release/policy.mjs";
import { syncVersion } from "../../scripts/release/version.mjs";

const sha = "a".repeat(40);

test("only stable main releases update latest; RC versions must match their branch", () => {
  assert.equal(releaseIdentity("1.2.3", "main", "42.1", sha).latest, true);
  assert.equal(releaseIdentity("1.3.0-develop.2", "develop", "43.1", sha).environment, "staging");
  assert.equal(releaseIdentity("1.3.0-rc.1", "release/v1.3.0", "44.1", sha).environment, null);
  for (const [version, branch] of [
    ["1.2.3", "develop"],
    ["1.2.3-rc.1", "main"],
    ["1.2.3-rc.1", "release/v2.0.0"],
    ["1.2.3", "feature/example"],
    ["01.2.3", "main"],
  ]) {
    assert.throws(() => releaseIdentity(version, branch, "42.1", sha));
  }
});

test("working branches merge into develop; production accepts release/hotfix branches", () => {
  for (const prefix of [
    "feature",
    "bugfix",
    "refactor",
    "chore",
    "docs",
    "test",
    "ci",
    "build",
    "perf",
  ]) {
    validatePullRequest(`${prefix}/ticket-123-example`, "develop");
    assert.throws(() => validatePullRequest(`${prefix}/ticket-123-example`, "main"));
  }
  validatePullRequest("release/v1.2.3", "main");
  validatePullRequest("hotfix/production-error", "main");
  validatePullRequest("main", "develop");
  validatePullRequest("dependabot/npm_and_yarn/dependencies-123", "develop");
  assert.throws(() => validatePullRequest("dependabot/npm_and_yarn/dependencies-123", "main"));
  assert.throws(() => validatePullRequest("develop", "main"));
  assert.throws(() => validateBranch("release/anything"));
});

test("release preparation keeps package, chart and frontend build identity in sync", () => {
  const root = mkdtempSync(join(tmpdir(), "mcvv-version-"));
  try {
    mkdirSync(join(root, "deploy/helm/mcvv"), { recursive: true });
    mkdirSync(join(root, "src/lib"), { recursive: true });
    writeFileSync(join(root, "package.json"), '{"name":"mcvv","version":"0.1.0"}');
    writeFileSync(
      join(root, "deploy/helm/mcvv/Chart.yaml"),
      'apiVersion: v2\nname: mcvv\nversion: "0.1.0"\nappVersion: "0.1.0"\n',
    );
    syncVersion(root, releaseIdentity("2.0.0", "main", "52.2", sha));
    assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, "2.0.0");
    assert.match(
      readFileSync(join(root, "deploy/helm/mcvv/Chart.yaml"), "utf8"),
      /appVersion: "2.0.0"/,
    );
    assert.deepEqual(JSON.parse(readFileSync(join(root, "src/lib/build-info.json"), "utf8")), {
      version: "2.0.0",
      buildNumber: "52.2",
      revision: sha,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("footer and version endpoint expose the same immutable version/build", async () => {
  const html = renderToStaticMarkup(createElement(BuildVersion));
  assert.ok(html.includes(`v${info.version}`));
  assert.ok(html.includes(`build ${info.buildNumber}`));
  const response = GET();
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), info);
});
