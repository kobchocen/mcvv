import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { processEnvironment } from "../../src/lib/env.ts";

const plugin = new URL("./plugin.mjs", import.meta.url).href;
const complete = new URL("./complete.mjs", import.meta.url).pathname;
const sha = "a".repeat(40);

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcvv-delivery-"));
  for (const dir of ["bin", "src/lib", "deploy/helm/mcvv", "infra/scripts", "infra/runtime"])
    fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), '{"version":"0.1.0"}');
  fs.writeFileSync(
    path.join(root, "deploy/helm/mcvv/Chart.yaml"),
    'version: "0.1.0"\nappVersion: "0.1.0"\n',
  );
  for (const file of ["Dockerfile", "scripts/build-context.py", "runtime/gateway.mjs"])
    fs.writeFileSync(path.join(root, "infra", file), "fixture");
  // All external services/build tools are isolated stubs; only command arguments are recorded.
  const stub = `#!${process.execPath}
const fs = require("node:fs"), path = require("node:path");
const command = path.basename(process.argv[1]), args = process.argv.slice(2);
fs.appendFileSync("commands.jsonl", JSON.stringify([command, ...args]) + "\\n");
if (command === "git") console.log("${sha}");
if (command === "python3") console.log(process.cwd());
if (command === "az") {
 if (args.includes("list")) console.log("[]");
 else if (args.includes("show")) console.log("sha256:" + "b".repeat(64));
}
if (command === "helm" && args[0] === "package") {
 const version = JSON.parse(fs.readFileSync("package.json")).version;
 fs.writeFileSync(path.join(args[args.indexOf("--destination") + 1], "mcvv-" + version + ".tgz"), "chart fixture");
}
if (command === "docker" && args.includes("build") && args.includes("migration") && fs.existsSync("fail-build")) process.exit(1);
`;
  for (const command of ["docker", "helm", "az", "pnpm", "python3", "git", "gh"])
    fs.writeFileSync(path.join(root, "bin", command), stub, { mode: 0o700 });
  const env = processEnvironment({
    PATH: path.join(root, "bin") + path.delimiter + path.dirname(process.execPath),
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "kobchocen/mcvv",
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: sha,
    GITHUB_RUN_NUMBER: "42",
    GITHUB_RUN_ATTEMPT: "1",
    INFRA_BUILD_REF: sha,
    INFRA_SOURCE_PATH: path.join(root, "infra"),
    INFRA_REPOSITORY: "example/infra",
    ACR_NAME: "registry",
    PUBLIC_BUILD_ENV_JSON: "{}",
    GH_TOKEN: "test-fixture",
    INFRA_DEPLOY_TOKEN: "test-fixture",
  });
  return {
    root,
    run(code) {
      return execFileSync(process.execPath, ["--input-type=module", "-e", code], {
        cwd: root,
        env,
        encoding: "utf8",
        stdio: "pipe",
      });
    },
    complete() {
      return execFileSync(process.execPath, [complete], {
        cwd: root,
        env,
        encoding: "utf8",
        stdio: "pipe",
      });
    },
    commands() {
      return fs
        .readFileSync(path.join(root, "commands.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse);
    },
    close() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

const prepare = `const p = await import(${JSON.stringify(plugin)}); p.verifyConditions(); p.prepare({}, {nextRelease:{version:"1.2.3"},logger:{log(){}}});`;

test("publication builds both images before pushes, records digests, then dispatches a tagged deployment", () => {
  const f = fixture();
  try {
    f.run(prepare);
    const manifest = JSON.parse(fs.readFileSync(path.join(f.root, "dist/release/release.json")));
    assert.equal(manifest.version, "1.2.3");
    assert.equal(manifest.buildNumber, "42.1");
    assert.equal(manifest.web, "registry.azurecr.io/web/prod@sha256:" + "b".repeat(64));
    assert.equal(manifest.chart.version, manifest.version);
    assert.equal(fs.existsSync(path.join(f.root, "dist/release/public-build.json")), false);
    const commands = f.commands();
    const pushes = commands.findIndex((c) => c[0] === "docker" && c[1] === "push");
    assert.equal(
      commands.slice(0, pushes).filter((c) => c[0] === "docker" && c[1] === "build").length,
      2,
    );
    f.complete();
    assert.deepEqual(
      f.commands().find((c) => c[0] === "gh"),
      [
        "gh",
        "workflow",
        "run",
        "deploy-release.yml",
        "--repo",
        "example/infra",
        "--ref",
        "main",
        "-f",
        "release_tag=v1.2.3",
        "-f",
        "environment=production",
      ],
    );
  } finally {
    f.close();
  }
});

test("failed migration image build prevents all image/chart publication", () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.root, "fail-build"), "fixture");
    assert.throws(() => f.run(prepare));
    assert.equal(
      f.commands().some((c) => c[1] === "push"),
      false,
    );
    assert.equal(fs.existsSync(path.join(f.root, "dist/release/release.json")), false);
  } finally {
    f.close();
  }
});
