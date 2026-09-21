import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "../src/lib/env";
import { databaseOptions } from "../src/lib/db/options";

async function main() {
  const options = databaseOptions(env);
  assert.equal(
    options.database,
    "mcvv_delivery_test",
    "Fixture requires the isolated test database",
  );
  const client = new PrismaClient({ adapter: new PrismaMariaDb(options) });
  const image = Buffer.alloc(80_000, 42);
  try {
    if (process.argv[2] === "write") {
      await client.photoLocation.create({ data: { id: "Z", desc: "TLS persistence", sort: 0 } });
      await client.photo.create({ data: { id: 1, year: 2026, locationId: "Z", image } });
    } else {
      assert.equal(process.argv[2], "read");
      const photo = await client.photo.findUniqueOrThrow({ where: { id: 1 } });
      assert.equal(photo.year, 2026);
      assert.deepEqual(Buffer.from(photo.image!), image);
    }
    console.log("Database persistence fixture passed.");
  } finally {
    await client.$disconnect();
  }
}

main().catch(() => {
  console.error("Database persistence fixture failed.");
  process.exitCode = 1;
});
