/**
 * Integration test of the club merge rewrite (#104, Q45) against a real MySQL / MariaDB.
 * Skipped unless CLUB_MERGE_DB_URL points to a throwaway database (name mcvv_tmp_* or *_test)
 * with all migrations applied, e.g.:
 *   CLUB_MERGE_DB_URL=mysql://root:…@127.0.0.1:3306/mcvv_tmp_merge pnpm exec node --import tsx \
 *     --test src/lib/clubs/merge-apply.db.test.ts
 * Runs the admin merge (applyClubMerge) and the migration SQL on the same scenario (year
 * collision, moved year with a legacy zero date, legacy rows without a cis_klub row) and
 * checks both give the same result. Its rows use editions 2091–2094 and are removed after.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { databaseOptions } from "@/lib/db/options";

import { applyClubMerge, previewClubMerge, type ClubMergeAuditDetail } from "./merge-apply";

const url = process.env.CLUB_MERGE_DB_URL;
const throwaway = url ? /\/(mcvv_tmp_\w+|\w+_test)$/.test(new URL(url).pathname) : false;
const skip = !url ? "CLUB_MERGE_DB_URL not set" : !throwaway ? "not a throwaway database" : false;

const MAIN = "ZMA";
const OTHER = "ZOT";
const SIBLING = "ZXX";
const YEARS = [2091, 2092, 2093, 2094];
const R1 = "20910001";
const R2 = "20910002";
const R3 = "20910003";

const MIGRATION = readFileSync(
  new URL(
    "../../../prisma/migrations/20261022150000_club_merge_rewrite/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("club merge rewrite (database)", { skip }, () => {
  let db: PrismaClient;

  before(() => {
    db = new PrismaClient({
      adapter: new PrismaMariaDb(databaseOptions({ DATABASE_URL: url, NODE_ENV: "test" })),
    });
  });
  after(async () => {
    await cleanup();
    await db.$disconnect();
  });

  async function cleanup() {
    const years = YEARS.join(",");
    for (const table of ["mcvv_time", "mcvv_start", "mcvv_prihlaska_radek"]) {
      await db.$executeRawUnsafe(`DELETE FROM \`${table}\` WHERE rok IN (${years})`);
    }
    await db.$executeRawUnsafe(`DELETE FROM mcvv_prihlaska WHERE rok IN (${years})`);
    await db.$executeRawUnsafe(`DELETE FROM cis_klub WHERE rok IN (${years})`);
    await db.$executeRawUnsafe(`DELETE FROM cis_bezec WHERE id IN ('${R1}','${R2}','${R3}')`);
    await db.$executeRawUnsafe(
      `DELETE FROM mcvv_klub_navrh_zamitnuty WHERE klub_id_a IN ('${MAIN}','${OTHER}','${SIBLING}')
         OR klub_id_b IN ('${MAIN}','${OTHER}','${SIBLING}')`,
    );
    await db.$executeRawUnsafe(`DELETE FROM mcvv_audit_log WHERE target = 'club:${MAIN}'`);
    await db.$executeRawUnsafe(`DELETE FROM cis_mcvv_kateg WHERE id = '~'`);
  }

  /**
   * MAIN: 2091, 2092. OTHER: 2092 (collision), 2093 (moves; legacy zero date). 2094: a start
   * of OTHER without any cis_klub row (legacy import). Rejected pair OTHER ⇄ SIBLING.
   */
  async function seed() {
    await cleanup();
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO cis_mcvv_kateg (id, jmeno, age, sort, sex, rekord, startovne, cislo_od, cislo_do)
         VALUES ('~', 'Test', 0, 99, 'M', 0, 0, 1, 2)`,
      );
      for (const id of [R1, R2, R3]) {
        await tx.$executeRawUnsafe(
          `INSERT INTO cis_bezec (id, jmeno) VALUES ('${id}', 'Test ${id}')`,
        );
      }
      // Legacy rows: zero date and a start without a cis_klub row (FK checks off, as imported).
      await tx.$executeRawUnsafe(`SET @mcvv_test_mode = @@SESSION.sql_mode`);
      await tx.$executeRawUnsafe(`SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'`);
      await tx.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 0`);
      await tx.$executeRawUnsafe(
        `INSERT INTO cis_klub (id, rok, jmeno, created, autor) VALUES
          ('${MAIN}', 2091, 'Hlavní klub 2091', NULL, 'admin'),
          ('${MAIN}', 2092, 'Hlavní klub', NULL, 'admin'),
          ('${OTHER}', 2092, 'Vedlejší id 2092', '2092-01-01 10:00:00', 'a@b.cz'),
          ('${OTHER}', 2093, 'Vedlejší id 2093', '0000-00-00 00:00:00', 'legacy')`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO mcvv_prihlaska (rok, id, nazev) VALUES (2092, 1, 'Test'), (2093, 1, 'Test')`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO mcvv_prihlaska_radek (bezec_id, klub_id, kateg_id, rok, prihlaska_id, created)
         VALUES ('${R1}', '${OTHER}', '~', 2092, 1, '0000-00-00 00:00:00'),
                ('${R2}', '${MAIN}', '~', 2092, 1, NULL),
                ('${R1}', '${OTHER}', '~', 2093, 1, NULL)`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO mcvv_start (bezec_id, klub_id, kateg_id, rok, cislo, klub_name) VALUES
          ('${R1}', '${OTHER}', '~', 2092, 1, 'Vedlejší'),
          ('${R1}', '${OTHER}', '~', 2093, 1, 'Vedlejší'),
          ('${R3}', '${OTHER}', '~', 2094, 2, 'Vedlejší bez číselníku')`,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO mcvv_time (bezec_id, rok, klub_id, kateg_id, time) VALUES
          ('${R1}', 2092, '${OTHER}', '~', 900),
          ('${R2}', 2092, '${MAIN}', '~', 950),
          ('${R1}', 2093, '${OTHER}', '~', 880)`,
      );
      await tx.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS = 1`);
      await tx.$executeRawUnsafe(`SET SESSION sql_mode = @mcvv_test_mode`);
      await tx.clubMergeRejection.create({ data: { clubIdA: OTHER, clubIdB: SIBLING } });
    });
  }

  async function state() {
    const clubs = await db.$queryRawUnsafe<{ id: string; rok: number; jmeno: string; c: string }[]>(
      `SELECT id, rok, jmeno, CAST(created AS CHAR) AS c FROM cis_klub
       WHERE rok IN (${YEARS.join(",")}) ORDER BY id, rok`,
    );
    const rows: Record<string, string[]> = {};
    for (const table of ["mcvv_prihlaska_radek", "mcvv_start", "mcvv_time"]) {
      const list = await db.$queryRawUnsafe<{ rok: number; bezec_id: string; klub_id: string }[]>(
        `SELECT rok, bezec_id, klub_id FROM \`${table}\` WHERE rok IN (${YEARS.join(",")})
         ORDER BY rok, bezec_id`,
      );
      rows[table] = list.map((row) => `${row.rok}/${row.bezec_id}/${row.klub_id}`);
    }
    const rejected = await db.clubMergeRejection.count({
      where: { OR: [{ clubIdA: OTHER }, { clubIdB: OTHER }] },
    });
    return {
      clubs: clubs.map((row) => `${row.id}/${Number(row.rok)}/${row.jmeno}`),
      zeroDate: clubs.find((row) => Number(row.rok) === 2093)?.c ?? null,
      rows,
      rejected,
    };
  }

  const EXPECTED_CLUBS = [
    `${MAIN}/2091/Hlavní klub 2091`,
    `${MAIN}/2092/Hlavní klub`, // collision: the main id's row and name stay
    `${MAIN}/2093/Vedlejší id 2093`, // moved with its own name
    `${MAIN}/2094/Hlavní klub`, // created for the legacy start, newest main name
  ];
  const EXPECTED_ROWS = {
    mcvv_prihlaska_radek: [`2092/${R1}/${MAIN}`, `2092/${R2}/${MAIN}`, `2093/${R1}/${MAIN}`],
    mcvv_start: [`2092/${R1}/${MAIN}`, `2093/${R1}/${MAIN}`, `2094/${R3}/${MAIN}`],
    mcvv_time: [`2092/${R1}/${MAIN}`, `2092/${R2}/${MAIN}`, `2093/${R1}/${MAIN}`],
  };

  it("admin merge: preview counts, rewrite in one transaction, audit before-state", async () => {
    await seed();
    const preview = await previewClubMerge(db, MAIN.toLowerCase(), OTHER);
    assert.ok(preview.ok);
    assert.deepEqual(preview.preview.counts, {
      mcvv_prihlaska_radek: 2,
      mcvv_start: 3,
      mcvv_time: 2,
      cisKlubMoved: 1,
      cisKlubDropped: 1,
      cisKlubCreated: 1,
      rejectedPairs: 1,
    });
    assert.deepEqual(preview.preview.dropYears, [
      { year: 2092, name: "Vedlejší id 2092", mainName: "Hlavní klub" },
    ]);

    const started = performance.now();
    const result = await db.$transaction((tx) =>
      applyClubMerge(tx, { mainId: MAIN, otherId: OTHER, author: "test@example.cz" }),
    );
    const ms = performance.now() - started;
    assert.ok(result.ok);
    const after = await state();
    assert.deepEqual(after.clubs, EXPECTED_CLUBS);
    assert.deepEqual(after.rows, EXPECTED_ROWS);
    assert.equal(after.rejected, 0);
    assert.match(after.zeroDate ?? "", /^0000-00-00/); // legacy value kept as it was

    const detail: ClubMergeAuditDetail = result.detail;
    assert.equal(detail.main, MAIN);
    assert.equal(detail.merged, OTHER);
    assert.deepEqual(
      detail.cisKlub.dropped.map((row) => [
        row.rok,
        row.jmeno,
        row.created?.slice(0, 19),
        row.autor,
      ]),
      [[2092, "Vedlejší id 2092", "2092-01-01 10:00:00", "a@b.cz"]],
    );
    assert.match(detail.cisKlub.moved[0]?.created ?? "", /^0000-00-00/);
    assert.deepEqual(
      detail.cisKlub.moved.map((row) => [row.rok, row.jmeno]),
      [[2093, "Vedlejší id 2093"]],
    );
    assert.deepEqual(detail.cisKlub.created, [{ rok: 2094, jmeno: "Hlavní klub" }]);
    assert.deepEqual(detail.rows.mcvv_start, [
      [2092, R1],
      [2093, R1],
      [2094, R3],
    ]);
    assert.deepEqual(detail.rejectedPairs, [[OTHER, SIBLING]]);
    console.log(`# applyClubMerge: ${ms.toFixed(0)} ms`);

    // Merging again: the merged id no longer exists.
    const again = await db.$transaction((tx) =>
      applyClubMerge(tx, { mainId: MAIN, otherId: OTHER, author: "test@example.cz" }),
    );
    assert.deepEqual(again, { ok: false, error: "unknown_other" });
  });

  it("migration: existing mcvv_klub_slouceni rows are rewritten the same way", async () => {
    await seed();
    await db.$executeRawUnsafe(
      `CREATE TABLE mcvv_klub_slouceni (
         klub_id VARCHAR(8) NOT NULL PRIMARY KEY,
         hlavni_klub_id VARCHAR(8) NOT NULL,
         created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
         author VARCHAR(255) NULL
       ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO mcvv_klub_slouceni (klub_id, hlavni_klub_id, author)
       VALUES ('${OTHER}', '${MAIN}', 'admin@example.cz')`,
    );
    const statements = MIGRATION.replace(/^\s*--.*$/gm, "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    const started = performance.now();
    await db.$transaction(async (tx) => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    });
    console.log(`# migration SQL: ${(performance.now() - started).toFixed(0)} ms`);
    const after = await state();
    assert.deepEqual(after.clubs, EXPECTED_CLUBS);
    assert.deepEqual(after.rows, EXPECTED_ROWS);
    assert.equal(after.rejected, 0);

    const [audit] = await db.auditLog.findMany({
      where: { action: "club.merge", target: `club:${MAIN}` },
      orderBy: { id: "desc" },
      take: 1,
    });
    const detail = (
      typeof audit.detail === "string" ? JSON.parse(audit.detail) : audit.detail
    ) as ClubMergeAuditDetail;
    assert.equal(audit.actorEmail, "admin@example.cz");
    assert.equal(detail.source, "migration");
    assert.deepEqual(
      detail.cisKlub.dropped.map((row) => row.rok),
      [2092],
    );
    assert.deepEqual(
      detail.cisKlub.moved.map((row) => row.rok),
      [2093],
    );
    assert.deepEqual(
      detail.cisKlub.created.map((row) => row.rok),
      [2094],
    );
    assert.equal(detail.rows.mcvv_start.length, 3);
    assert.deepEqual(detail.rejectedPairs, [[OTHER, SIBLING]]);
    const tables = await db.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE()
         AND table_name IN ('mcvv_klub_slouceni', '_mcvv_klub_slouceni_plan')`,
    );
    assert.equal(tables.length, 0);
  });
});
