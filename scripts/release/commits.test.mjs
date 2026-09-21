import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import config from "../../release.config.mjs";
const sha = "a".repeat(40);

test("semantic-release calculates major/minor/patch from real Conventional Commits", async () => {
  const analyzer = config.plugins[0][1];
  for (const [message, expected] of [
    ["feat(results): add filters", "minor"],
    ["fix(db): correct migration entry", "patch"],
    ["refactor(db): share client", "patch"],
    ["refactor(db)!: remove legacy schema", "major"],
    ["feat(api)!: remove endpoint", "major"],
    ["docs: explain installation", null],
    ["chore(release): v1.2.3 [skip ci]", null],
  ]) {
    const result = await analyzeCommits(analyzer, {
      cwd: process.cwd(),
      commits: [{ hash: sha, message }],
      logger: { log() {} },
    });
    assert.equal(result, expected, message);
  }
});
