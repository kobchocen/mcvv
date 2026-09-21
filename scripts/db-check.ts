import "dotenv/config";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "../src/lib/env";
import { databaseOptions } from "../src/lib/db/options";
import { checkDatabase } from "../src/lib/db/check";

async function main() {
  const options = databaseOptions(env);
  const client = new PrismaClient({ adapter: new PrismaMariaDb(options) });
  try {
    const directory = new URL("../prisma/migrations/", import.meta.url);
    const migrations = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        checksum: createHash("sha256")
          .update(readFileSync(new URL(`${entry.name}/migration.sql`, directory)))
          .digest("hex"),
      }));
    await checkDatabase(client, Boolean(options.ssl), migrations);
    console.log("Database connection, TLS policy, migrations and schema verified.");
  } finally {
    await client.$disconnect();
  }
}

main().catch(() => {
  console.error(
    "Database check failed. Check database connectivity, TLS and schema migration status.",
  );
  process.exitCode = 1;
});
