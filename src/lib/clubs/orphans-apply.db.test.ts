/**
 * Integration test of the orphan club cleanup (#193) against a real MySQL / MariaDB.
 * Skipped unless CLUB_MERGE_DB_URL points to a throwaway database (name mcvv_tmp_* or *_test)
 * with all migrations applied (same variable as merge-apply.db.test.ts). Its rows use
 * editions 2095–2097 and club ids ZO*, and are removed after.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { databaseOptions } from "@/lib/db/options";

import { deleteOrphanRows, loadClubRegistry } from "./orphans-apply";
import { planOrphanCleanup } from "./orphans";

const url = process.env.CLUB_MERGE_DB_URL;
const throwaway = url ? /\/(mcvv_tmp_\w+|\w+_test)$/.test(new URL(url).pathname) : false;
const skip = !url ? "CLUB_MERGE_DB_URL not set" : !throwaway ? "not a throwaway database" : false;

const YEARS = "2095,2096,2097";
const R1 = "20950001";

describe("orphan club cleanup (database)", { skip }, () => {
  let db: PrismaClient;

  before(async () => {
    db = new PrismaClient({
      adapter: new PrismaMariaDb(databaseOptions({ DATABASE_URL: url, NODE_ENV: "test" })),
    });
    await cleanup();
    await db.$executeRawUnsafe(
      `INSERT INTO cis_mcvv_kateg (id, jmeno, age, sort, sex, rekord, startovne, cislo_od, cislo_do)
       VALUES ('~', 'Test', 0, 99, 'M', 0, 0, 1, 2)`,
    );
    await db.$executeRawUnsafe(`INSERT INTO cis_bezec (id, jmeno) VALUES ('${R1}', 'Test')`);
    // ZOB has a legacy zero date (as imported) – the loader must not crash on it.
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET @mcvv_test_mode = @@SESSION.sql_mode`);
      await tx.$executeRawUnsafe(`SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'`);
      await tx.$executeRawUnsafe(
        `INSERT INTO cis_klub (id, rok, jmeno, created, autor) VALUES
          ('ZOA', 2095, 'Prázdný rok', NULL, 'web'), ('ZOA', 2096, 'S výsledkem', NULL, 'web'),
          ('ZOB', 2095, 'Celý sirotek', '0000-00-00 00:00:00', 'legacy'),
          ('ZOD', 2097, 'Aktuální ročník', NULL, 'web')`,
      );
      await tx.$executeRawUnsafe(`SET SESSION sql_mode = @mcvv_test_mode`);
    });
    await db.$executeRawUnsafe(
      `INSERT INTO mcvv_time (bezec_id, rok, klub_id, kateg_id, time) VALUES ('${R1}', 2096, 'ZOA', '~', 900)`,
    );
  });
  after(async () => {
    await cleanup();
    await db.$disconnect();
  });

  async function cleanup() {
    await db.$executeRawUnsafe(`DELETE FROM mcvv_time WHERE rok IN (${YEARS})`);
    await db.$executeRawUnsafe(`DELETE FROM cis_klub WHERE rok IN (${YEARS})`);
    await db.$executeRawUnsafe(`DELETE FROM cis_bezec WHERE id = '${R1}'`);
    await db.$executeRawUnsafe(`DELETE FROM cis_mcvv_kateg WHERE id = '~'`);
  }

  it("plans and deletes only unreferenced past rows", async () => {
    const registry = (await loadClubRegistry(db)).filter((row) => row.id.startsWith("ZO"));
    assert.deepEqual(registry.map((row) => `${row.id}/${row.year}:${row.used}`).sort(), [
      "ZOA/2095:false",
      "ZOA/2096:true",
      "ZOB/2095:false",
      "ZOD/2097:false",
    ]);
    assert.equal(registry.find((row) => row.id === "ZOB")?.created, null);
    const ids = planOrphanCleanup(registry, { scope: "ids", currentYear: 2097 });
    assert.deepEqual(
      ids.rows.map((row) => `${row.id}/${row.year}`),
      ["ZOB/2095"],
    );
    const plan = planOrphanCleanup(registry, { scope: "rows", currentYear: 2097 });
    assert.deepEqual(
      plan.rows.map((row) => `${row.id}/${row.year}`),
      ["ZOA/2095", "ZOB/2095"],
    );
    assert.equal(await deleteOrphanRows(db, plan.rows), 2);
    // A referenced row is never deleted, even if asked to.
    assert.equal(await deleteOrphanRows(db, [{ id: "ZOA", year: 2096 }]), 0);
    const left = await db.$queryRawUnsafe<{ k: string }[]>(
      `SELECT CONCAT(id, '/', rok) AS k FROM cis_klub WHERE rok IN (${YEARS}) ORDER BY id, rok`,
    );
    assert.deepEqual(
      left.map((row) => row.k),
      ["ZOA/2096", "ZOD/2097"],
    );
  });
});
