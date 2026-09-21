import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "../src/lib/env";
import { databaseOptions, migrationUrl } from "../src/lib/db/options";
import { migrationErrorCode, migrationFailure, prismaCliPath } from "../src/lib/db/prisma-cli";

let temporaryDirectory: string | undefined;
let stage = "TLS configuration";
try {
  const options = databaseOptions(env);
  let caPath: string | undefined;
  if (options.ssl && typeof options.ssl === "object") {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "mcvv-migrate-"));
    caPath = join(temporaryDirectory, "ca.crt");
    const ca = options.ssl.ca;
    writeFileSync(caPath, Array.isArray(ca) ? ca.join("\n") : String(ca), { mode: 0o600 });
  }
  stage = "Prisma CLI resolution";
  const cli = prismaCliPath();
  stage = "Prisma migrate deploy";
  const result = spawnSync(process.execPath, [cli, "migrate", "deploy"], {
    env: { ...env, DATABASE_URL: migrationUrl(env.DATABASE_URL!, caPath) },
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  // Prisma owns the advisory lock and migration history. Never reset or seed here.
  if (result.error || result.status !== 0) {
    console.error(`Database migration failed during ${stage}: ${migrationFailure(result)}`);
    process.exitCode = 1;
  } else {
    console.log("Database migrations applied successfully.");
  }
} catch (error) {
  console.error(`Database migration failed during ${stage}: code=${migrationErrorCode(error)}`);
  process.exitCode = 1;
} finally {
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
}
