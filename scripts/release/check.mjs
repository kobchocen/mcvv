import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { processEnvironment } from "../../src/lib/env.ts";
import { validateBranch, validatePullRequest, versionPattern } from "./policy.mjs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const info = JSON.parse(fs.readFileSync("src/lib/build-info.json", "utf8"));
const chart = fs.readFileSync("deploy/helm/mcvv/Chart.yaml", "utf8");
if (
  !versionPattern.test(pkg.version) ||
  info.version !== pkg.version ||
  !chart.includes(`version: "${pkg.version}"`) ||
  !chart.includes(`appVersion: "${pkg.version}"`)
) {
  throw new Error("package.json, build-info and Helm chart versions must match");
}
const settings = processEnvironment();
if (settings.GITHUB_HEAD_REF && settings.GITHUB_BASE_REF) {
  validatePullRequest(settings.GITHUB_HEAD_REF, settings.GITHUB_BASE_REF);
} else if (settings.GITHUB_REF_TYPE !== "tag") {
  const branch =
    settings.GITHUB_REF_NAME ||
    execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  validateBranch(branch);
}
console.log("Release versions and branch policy verified.");
