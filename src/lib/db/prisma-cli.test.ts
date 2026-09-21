import assert from "node:assert/strict";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { migrationErrorCode, migrationFailure, prismaCliPath } from "./prisma-cli";

test("migration entry point runs the real Prisma CLI without database configuration", () => {
  const directory = mkdtempSync(join(tmpdir(), "mcvv-cli-test-"));
  try {
    const result = spawnSync(process.execPath, [prismaCliPath(), "migrate", "deploy", "--help"], {
      cwd: directory,
      env: { NODE_ENV: "test", CHECKPOINT_DISABLE: "1" },
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Apply pending migrations/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration diagnostics expose status and Prisma codes without connection details", () => {
  const result = {
    status: 1,
    signal: null,
    stdout: "mysql://user:private-password@private-host/database",
    stderr: "Error: P1001: Can't reach private-host",
  } as SpawnSyncReturns<string>;
  assert.equal(migrationFailure(result), "exit=1 signal=none code=P1001");
  assert.equal(
    migrationFailure({ ...result, stderr: "Error: unclassified private-password" }),
    "exit=1 signal=none code=UNKNOWN",
  );
  assert.equal(
    migrationFailure({
      ...result,
      status: null,
      signal: "SIGTERM",
      error: Object.assign(new Error("private-password"), { code: "ETIMEDOUT" }),
    }),
    "exit=none signal=SIGTERM code=ETIMEDOUT",
  );
  assert.equal(migrationErrorCode({ code: "MODULE_NOT_FOUND" }), "MODULE_NOT_FOUND");
  assert.equal(migrationErrorCode(new Error("private-password")), "UNKNOWN");
});
