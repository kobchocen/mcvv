import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { processEnvironment, releaseEnvironment } from "../../src/lib/env.ts";
import { releaseIdentity } from "./policy.mjs";
import { syncVersion } from "./version.mjs";

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", ...options });
}

function identity(version) {
  const settings = releaseEnvironment();
  return releaseIdentity(
    version,
    settings.GITHUB_REF_NAME,
    `${settings.GITHUB_RUN_NUMBER}.${settings.GITHUB_RUN_ATTEMPT}`,
    settings.GITHUB_SHA,
  );
}

export function verifyConditions() {
  const settings = releaseEnvironment();
  if (["main", "develop"].includes(settings.GITHUB_REF_NAME) && !settings.INFRA_DEPLOY_TOKEN) {
    throw new Error("INFRA_DEPLOY_TOKEN is required before publishing a deployable release");
  }
  for (const [command, args] of [
    ["docker", ["version"]],
    ["helm", ["version", "--short"]],
    ["az", ["version"]],
  ]) {
    run(command, args);
  }
  if (
    run("git", ["rev-parse", "HEAD"], { cwd: settings.INFRA_SOURCE_PATH }).trim() !==
    settings.INFRA_BUILD_REF
  ) {
    throw new Error("Infrastructure checkout must match the pinned INFRA_BUILD_REF commit");
  }
  const publicValues = JSON.parse(settings.PUBLIC_BUILD_ENV_JSON);
  if (
    !publicValues ||
    Array.isArray(publicValues) ||
    typeof publicValues !== "object" ||
    Object.entries(publicValues).some(
      ([key, value]) => !/^NEXT_PUBLIC_[A-Z0-9_]+$/.test(key) || typeof value !== "string",
    )
  ) {
    throw new Error("PUBLIC_BUILD_ENV_JSON must contain only public NEXT_PUBLIC_* strings");
  }
  for (const file of ["Dockerfile", "scripts/build-context.py", "runtime/gateway.mjs"]) {
    if (!fs.existsSync(path.join(settings.INFRA_SOURCE_PATH, file)))
      throw new Error("Infrastructure build source is missing");
  }
}

export function verifyRelease(_config, context) {
  identity(context.nextRelease.version);
}

export function prepare(_config, context) {
  const settings = releaseEnvironment();
  const release = identity(context.nextRelease.version);
  const root = process.cwd();
  const infra = path.resolve(settings.INFRA_SOURCE_PATH);
  const dist = path.join(root, "dist/release");
  fs.mkdirSync(dist, { recursive: true });
  syncVersion(root, release);
  run(
    "pnpm",
    [
      "exec",
      "prettier",
      "--write",
      "package.json",
      "CHANGELOG.md",
      "src/lib/build-info.json",
      "deploy/helm/mcvv/Chart.yaml",
    ],
    { stdio: "inherit" },
  );
  // Use the existing infrastructure Dockerfile/gateway, preserving staging auth.
  const buildContext = run("python3", ["scripts/build-context.py"], {
    cwd: infra,
    env: processEnvironment({ APP_SOURCE_PATH: root }),
  }).trim();
  const publicFile = path.join(dist, "public-build.json");
  fs.writeFileSync(publicFile, settings.PUBLIC_BUILD_ENV_JSON);
  const publicHash = createHash("sha256").update(settings.PUBLIC_BUILD_ENV_JSON).digest("hex");
  const registry = `${settings.ACR_NAME}.azurecr.io`;
  const repositories = JSON.parse(
    run("az", ["acr", "repository", "list", "--name", settings.ACR_NAME, "-o", "json"]),
  );
  if (repositories.includes("helm/mcvv")) {
    const tags = JSON.parse(
      run("az", [
        "acr",
        "repository",
        "show-tags",
        "--name",
        settings.ACR_NAME,
        "--repository",
        "helm/mcvv",
        "-o",
        "json",
      ]),
    );
    if (tags.includes(release.version))
      throw new Error("Refusing to overwrite immutable Helm version");
  }
  const images = {};
  for (const [kind, target] of [
    ["web", "runtime"],
    ["migration", "migration"],
  ]) {
    const repository = `${kind}/${release.target}`;
    const image = `${registry}/${repository}:${release.version}`;
    if (repositories.includes(repository)) {
      const tags = JSON.parse(
        run("az", [
          "acr",
          "repository",
          "show-tags",
          "--name",
          settings.ACR_NAME,
          "--repository",
          repository,
          "-o",
          "json",
        ]),
      );
      if (tags.includes(release.version))
        throw new Error(`Refusing to overwrite immutable image ${image}`);
    }
    run(
      "docker",
      [
        "build",
        "--platform",
        "linux/amd64",
        "--target",
        target,
        "--build-arg",
        "NODE_IMAGE=node:24.15.0-bookworm-slim",
        "--build-arg",
        `PUBLIC_BUILD_ENV_SHA256=${publicHash}`,
        "--secret",
        `id=public_env,src=${publicFile}`,
        "--label",
        `org.opencontainers.image.version=${release.version}`,
        "--label",
        `org.opencontainers.image.revision=${release.revision}`,
        "--label",
        `org.mcvv.build=${release.buildNumber}`,
        "--tag",
        image,
        buildContext,
      ],
      { stdio: "inherit" },
    );
    images[kind] = { image, repository };
  }
  // Finish all local builds before publishing either image.
  run(
    "helm",
    [
      "lint",
      "deploy/helm/mcvv",
      "--strict",
      "--set",
      `image.repository=${registry}/web/${release.target}`,
      "--set",
      `migration.repository=${registry}/migration/${release.target}`,
    ],
    { stdio: "inherit" },
  );
  run("helm", ["package", "deploy/helm/mcvv", "--destination", dist], { stdio: "inherit" });
  for (const entry of Object.values(images)) {
    run("docker", ["push", entry.image], { stdio: "inherit" });
    const digest = run("az", [
      "acr",
      "repository",
      "show",
      "--name",
      settings.ACR_NAME,
      "--image",
      `${entry.repository}:${release.version}`,
      "--query",
      "digest",
      "-o",
      "tsv",
    ]).trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid image digest");
    entry.reference = `${registry}/${entry.repository}@${digest}`;
    entry.digest = digest;
  }
  // Docker and Helm share registry credentials through their standard login config.
  const chart = path.join(dist, `mcvv-${release.version}.tgz`);
  run("helm", ["push", chart, `oci://${registry}/helm`], { stdio: "inherit" });
  const chartDigest = run("az", [
    "acr",
    "repository",
    "show",
    "--name",
    settings.ACR_NAME,
    "--image",
    `helm/mcvv:${release.version}`,
    "--query",
    "digest",
    "-o",
    "tsv",
  ]).trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(chartDigest)) throw new Error("Invalid chart digest");
  const manifest = {
    schema: 1,
    ...release,
    application_repository: settings.GITHUB_REPOSITORY,
    infrastructure_repository: settings.INFRA_REPOSITORY,
    infrastructure_commit: run("git", ["rev-parse", "HEAD"], { cwd: infra }).trim(),
    web: images.web.reference,
    migration: images.migration.reference,
    chart: {
      repository: `oci://${registry}/helm/mcvv`,
      version: release.version,
      digest: chartDigest,
    },
  };
  fs.writeFileSync(path.join(dist, "release.json"), JSON.stringify(manifest, null, 2) + "\n");
  fs.writeFileSync(
    path.join(dist, "values.json"),
    JSON.stringify(
      {
        environment: release.target === "prod" ? "prod" : "stg",
        image: { repository: `${registry}/web/${release.target}`, digest: images.web.digest },
        migration: {
          repository: `${registry}/migration/${release.target}`,
          digest: images.migration.digest,
        },
      },
      null,
      2,
    ) + "\n",
  );
  fs.unlinkSync(publicFile);
  const checksums = fs
    .readdirSync(dist)
    .filter((name) => name !== "SHA256SUMS")
    .sort()
    .map(
      (name) =>
        `${createHash("sha256")
          .update(fs.readFileSync(path.join(dist, name)))
          .digest("hex")}  ${name}`,
    );
  fs.writeFileSync(path.join(dist, "SHA256SUMS"), checksums.join("\n") + "\n");
  context.logger.log(
    `Prepared ${release.tag}, build ${release.buildNumber}, immutable images and Helm chart`,
  );
}
