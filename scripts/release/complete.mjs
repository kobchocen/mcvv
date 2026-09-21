import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { processEnvironment, releaseEnvironment } from "../../src/lib/env.ts";
import { releaseIdentity } from "./policy.mjs";

const file = "dist/release/release.json";
if (fs.existsSync(file)) {
  const settings = releaseEnvironment();
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const release = releaseIdentity(
    manifest.version,
    settings.GITHUB_REF_NAME,
    manifest.buildNumber,
    settings.GITHUB_SHA,
  );
  if (release.latest) {
    for (const kind of ["web", "migration"]) {
      const reference = manifest[kind];
      if (
        !new RegExp(`^${settings.ACR_NAME}\\.azurecr\\.io/${kind}/prod@sha256:[a-f0-9]{64}$`).test(
          reference,
        )
      ) {
        throw new Error("Invalid production image reference");
      }
      // Pull the published digest, then alias it: AcrPush is sufficient.
      execFileSync("docker", ["pull", reference], { stdio: "inherit" });
      const latest = `${settings.ACR_NAME}.azurecr.io/${kind}/prod:latest`;
      execFileSync("docker", ["tag", reference, latest], { stdio: "inherit" });
      execFileSync("docker", ["push", latest], { stdio: "inherit" });
    }
  }
  if (release.environment) {
    execFileSync(
      "gh",
      [
        "workflow",
        "run",
        "deploy-release.yml",
        "--repo",
        settings.INFRA_REPOSITORY,
        "--ref",
        "main",
        "-f",
        `release_tag=${release.tag}`,
        "-f",
        `environment=${release.environment}`,
      ],
      {
        stdio: "inherit",
        env: processEnvironment({ GH_TOKEN: settings.INFRA_DEPLOY_TOKEN }),
      },
    );
    console.log(
      `Deployment requested: https://github.com/${settings.INFRA_REPOSITORY}/actions/workflows/deploy-release.yml`,
    );
  }
} else {
  console.log("No releasable changes: publication and deployment skipped.");
}
