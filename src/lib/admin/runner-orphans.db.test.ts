/**
 * Integration test of runner links and orphan deletion against a real MySQL / MariaDB.
 * Skipped unless CLUB_MERGE_DB_URL points to a throwaway database (name mcvv_tmp_* or *_test)
 * with all migrations applied. Its rows use runner ids 2099000x and year 2099, removed after.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { databaseOptions } from "@/lib/db/options";

import { deleteOrphanRunners, loadRunnerLinkCounts, loadRunnerOrphans } from "./runner-orphans";
import { totalLinks } from "./runner-orphans-core";

const url = process.env.CLUB_MERGE_DB_URL;
const throwaway = url ? /\/(mcvv_tmp_\w+|\w+_test)$/.test(new URL(url).pathname) : false;
const skip = !url ? "CLUB_MERGE_DB_URL not set" : !throwaway ? "not a throwaway database" : false;

const ORPHAN = "20990001";
const LOCKED = "20990002"; // jen řádek startovky (CASCADE) – i ten musí smazání blokovat
const PARTNER = "20990003"; // jen partner ve spec. startu (SET NULL) – taky blokuje
const SPECIAL = "20990004";
const IDS = `'${ORPHAN}','${LOCKED}','${PARTNER}','${SPECIAL}'`;

describe("runner orphans (database)", { skip }, () => {
  let db: PrismaClient;

  before(async () => {
    db = new PrismaClient({
      adapter: new PrismaMariaDb(databaseOptions({ DATABASE_URL: url, NODE_ENV: "test" })),
    });
    await cleanup();
    await db.$executeRawUnsafe(
      `INSERT INTO cis_bezec (id, jmeno) VALUES ('${ORPHAN}', 'Zz Sirotek'),
        ('${LOCKED}', 'Zz Zamčený'), ('${PARTNER}', 'Zz Partner'), ('${SPECIAL}', 'Zz Spec')`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO mcvv_start_radek (rok, bezec_id, zamceno, updated_at) VALUES (2099, '${LOCKED}', 1, NOW())`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO mcvv_spec_start (rok, bezec_id, typ, partner_bezec_id, updated_at)
       VALUES (2099, '${SPECIAL}', 'with', '${PARTNER}', NOW())`,
    );
  });
  after(async () => {
    await cleanup();
    await db.$disconnect();
  });

  async function cleanup() {
    await db.$executeRawUnsafe(`DELETE FROM mcvv_spec_start WHERE rok = 2099`);
    await db.$executeRawUnsafe(`DELETE FROM mcvv_start_radek WHERE rok = 2099`);
    await db.$executeRawUnsafe(`DELETE FROM cis_bezec WHERE id IN (${IDS})`);
  }

  it("counts links of each kind", async () => {
    assert.equal(totalLinks(await loadRunnerLinkCounts(db, ORPHAN)), 0);
    assert.equal((await loadRunnerLinkCounts(db, LOCKED)).startLines, 1);
    assert.equal((await loadRunnerLinkCounts(db, PARTNER)).specialPartners, 1);
    assert.equal((await loadRunnerLinkCounts(db, SPECIAL)).specialStarts, 1);
  });

  it("lists only runners without any link", async () => {
    const ours = (await loadRunnerOrphans(db)).filter((row) => row.id.startsWith("2099"));
    assert.deepEqual(
      ours.map((row) => row.id),
      [ORPHAN],
    );
  });

  it("deletes only unlinked runners, never cascades", async () => {
    const result = await db.$transaction((tx) =>
      deleteOrphanRunners(tx, [ORPHAN, LOCKED, PARTNER, SPECIAL]),
    );
    assert.equal(result.deleted, 1);
    assert.deepEqual(
      result.rows.map((row) => [row.id, row.name]),
      [[ORPHAN, "Zz Sirotek"]],
    );
    const left = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM cis_bezec WHERE id IN (${IDS}) ORDER BY id`,
    );
    assert.deepEqual(
      left.map((row) => row.id),
      [LOCKED, PARTNER, SPECIAL],
    );
    const lines = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM mcvv_start_radek WHERE rok = 2099`,
    );
    assert.equal(Number(lines[0]?.n), 1);
  });
});
