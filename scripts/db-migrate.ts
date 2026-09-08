import "dotenv/config";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { env } from "../src/lib/env";
import { databaseOptions, migrationUrl } from "../src/lib/db/options";

let temporaryDirectory: string | undefined;
try {
  const options = databaseOptions(env);
  let caPath: string | undefined;
  if (options.ssl && typeof options.ssl === "object") {
    temporaryDirectory = mkdtempSync(join(tmpdir(), "mcvv-migrate-"));
    caPath = join(temporaryDirectory, "ca.crt");
    const ca = options.ssl.ca;
    writeFileSync(caPath, Array.isArray(ca) ? ca.join("\n") : String(ca), { mode: 0o600 });
  }
  const require = createRequire(import.meta.url);
  const result = spawnSync(process.execPath, [require.resolve("prisma"), "migrate", "deploy"], {
    env: { ...env, DATABASE_URL: migrationUrl(env.DATABASE_URL!, caPath) },
    encoding: "utf8",
    timeout: 300_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  // Prisma owns the advisory lock and migration history. Never reset or seed here.
  // Suppress CLI output, which can contain connection details on failures.
  if (result.error || result.status !== 0) throw new Error("Migration failed");
  console.log("Database migrations applied successfully.");
} catch {
  console.error(
    "Database migration failed. Check database connectivity, TLS and migration history.",
  );
  process.exitCode = 1;
} finally {
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
}
