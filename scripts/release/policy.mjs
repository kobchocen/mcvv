export const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(develop|rc)\.(0|[1-9]\d*))?$/;
export const workingBranchPattern =
  /^(feature|bugfix|hotfix|refactor|docs|chore|test|ci|build|perf)\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
export const releaseBranchPattern = /^release\/v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/;

const automationBranchPattern = /^dependabot\/(npm_and_yarn|github_actions)\/[a-zA-Z0-9._/-]+$/;

export function validateBranch(branch) {
  if (
    !["main", "develop"].includes(branch) &&
    !workingBranchPattern.test(branch) &&
    !releaseBranchPattern.test(branch) &&
    !automationBranchPattern.test(branch)
  ) {
    throw new Error("Use main, develop, release/vX.Y.Z or a Daxaris working branch prefix");
  }
}

export function validatePullRequest(head, base) {
  validateBranch(head);
  validateBranch(base);
  if (automationBranchPattern.test(head) && base === "develop") return;
  if (base === "main" && !releaseBranchPattern.test(head) && !head.startsWith("hotfix/")) {
    throw new Error("Production accepts release/* or hotfix/* pull requests");
  }
  if (base === "develop" && head === "main") return; // Back-merge production fixes/releases.
  if (base === "develop" && (workingBranchPattern.test(head) || releaseBranchPattern.test(head)))
    return;
  if (base === "main") return;
  if (releaseBranchPattern.test(base) && /^(bugfix|hotfix|docs|test|ci|build)\//.test(head)) return;
  throw new Error("Unsupported pull request direction");
}

export function releaseIdentity(version, branch, buildNumber, revision) {
  const match = versionPattern.exec(version);
  if (!match || !/^\d+(?:\.\d+)?$/.test(buildNumber) || !/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error("Invalid release version, build number or commit");
  }
  const channel = match[4];
  const candidate = releaseBranchPattern.exec(branch);
  if (branch === "main" && !channel) {
    return {
      version,
      buildNumber,
      revision,
      branch,
      tag: `v${version}`,
      target: "prod",
      environment: "production",
      latest: true,
    };
  }
  if (branch === "develop" && channel === "develop") {
    return {
      version,
      buildNumber,
      revision,
      branch,
      tag: `v${version}`,
      target: "stg",
      environment: "staging",
      latest: false,
    };
  }
  if (candidate && channel === "rc" && version.split("-")[0] === candidate[1]) {
    return {
      version,
      buildNumber,
      revision,
      branch,
      tag: `v${version}`,
      target: "rc",
      environment: null,
      latest: false,
    };
  }
  throw new Error("Release version does not match its branch/channel");
}
