/**
 * One-off: fill mcvv_fotky.width/height (and has_image) from blobs in small batches.
 * Only for local/dev DBs. Refuses non-local hosts unless --allow-remote is passed
 * (do NOT run against production without an agreed maintenance window).
 *
 *   node --import tsx scripts/backfill-photo-dims.ts [--batch=25]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "../src/lib/env";
import { databaseOptions } from "../src/lib/db/options";
import { getImageDimensions } from "../src/lib/utils";

async function main() {
  const options = databaseOptions(env);
  const host = String(options.host ?? "");
  if (
    !["127.0.0.1", "localhost", "::1"].includes(host) &&
    !process.argv.includes("--allow-remote")
  ) {
    throw new Error(
      `Refusing to run against non-local host "${host}" (use --allow-remote deliberately).`,
    );
  }
  const batchArg = process.argv.find((a) => a.startsWith("--batch="));
  const batch = batchArg ? Number(batchArg.split("=")[1]) : 25;
  const client = new PrismaClient({ adapter: new PrismaMariaDb(options) });
  let lastId = -1;
  let done = 0;
  let unknown = 0;
  try {
    for (;;) {
      const ids = await client.photo.findMany({
        where: { id: { gt: lastId }, hasImage: true, width: null },
        select: { id: true },
        orderBy: { id: "asc" },
        take: batch,
      });
      if (ids.length === 0) break;
      lastId = ids[ids.length - 1].id;
      const rows = await client.photo.findMany({
        where: { id: { in: ids.map((r) => r.id) } },
        select: { id: true, image: true },
      });
      for (const row of rows) {
        const dims = row.image ? getImageDimensions(Buffer.from(row.image)) : null;
        if (!dims) unknown++;
        await client.photo.updateMany({
          where: { id: row.id }, // updateMany: no row read-back (legacy zero dates)
          data: dims ? { width: dims.width, height: dims.height } : { width: 0, height: 0 }, // 0 = unknown format, skip next time
        });
        done++;
      }
      console.log(`processed ${done} (last id ${lastId}, unknown ${unknown})`);
    }
  } finally {
    await client.$disconnect();
  }
  console.log(`Done: ${done} photos, ${unknown} with unknown dimensions.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
