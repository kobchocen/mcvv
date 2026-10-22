import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(
  new URL(
    "../../../prisma/migrations/20261022130000_club_identity_by_id/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const statements = sql
  .split(";")
  .map((part) => part.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

test("migrace: id klubu varchar(8) ve všech tabulkách s id klubu", () => {
  for (const [table, column] of [
    ["cis_klub", "id"],
    ["mcvv_prihlaska_radek", "klub_id"],
    ["mcvv_start", "klub_id"],
    ["mcvv_time", "klub_id"],
  ]) {
    assert.ok(
      statements.some(
        (statement) =>
          statement.startsWith(`ALTER TABLE \`${table}\``) &&
          statement.includes(`MODIFY \`${column}\` VARCHAR(8) NOT NULL`),
      ),
      `${table}.${column}`,
    );
  }
});

test("migrace: legacy data se nemění (žádný UPDATE/DELETE/INSERT, žádné DROP COLUMN)", () => {
  assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE|INSERT)\b/im);
  assert.doesNotMatch(sql, /DROP\s+COLUMN/i);
  for (const table of ["cis_klub", "mcvv_prihlaska_radek", "mcvv_start", "mcvv_time"]) {
    assert.doesNotMatch(sql, new RegExp(`DROP TABLE \`${table}\``));
  }
});

test("migrace: cizí klíče se vrací stejné, bez kontroly starých řádků", () => {
  const off = statements.indexOf("SET FOREIGN_KEY_CHECKS = 0");
  const on = statements.indexOf("SET FOREIGN_KEY_CHECKS = 1");
  assert.ok(off >= 0 && on > off);
  for (const table of ["mcvv_prihlaska_radek", "mcvv_start", "mcvv_time"]) {
    const drop = statements.findIndex((s) =>
      s.includes(`DROP FOREIGN KEY \`${table}_klub_id_rok_fkey\``),
    );
    const add = statements.findIndex(
      (s) =>
        s.startsWith(
          `ALTER TABLE \`${table}\` ALGORITHM=COPY, ADD CONSTRAINT \`${table}_klub_id_rok_fkey\``,
        ) && s.includes("ON DELETE RESTRICT ON UPDATE CASCADE"),
    );
    assert.ok(drop >= 0 && add > off && add < on, table);
  }
});

test("migrace: sql_mode bez nulových dat jen dočasně (legacy '0000-00-00' v MySQL 8.4)", () => {
  const save = statements.indexOf("SET @MCVV_OLD_SQL_MODE = @@SESSION.sql_mode");
  const restore = statements.indexOf("SET SESSION sql_mode = @MCVV_OLD_SQL_MODE");
  const relaxed = statements.findIndex((s) => s.startsWith("SET SESSION sql_mode = 'STRICT"));
  const firstAlter = statements.findIndex((s) => s.startsWith("ALTER TABLE"));
  assert.ok(save >= 0 && save < relaxed && relaxed < firstAlter && restore > relaxed);
  assert.doesNotMatch(statements[relaxed], /NO_ZERO/);
});

test("migrace: sloučení podle id místo aliasů názvů", () => {
  assert.match(sql, /DROP TABLE `mcvv_klub_alias`/);
  assert.match(sql, /DROP TABLE `mcvv_klub`/);
  assert.match(
    sql,
    /CREATE TABLE `mcvv_klub_slouceni`[\s\S]*`hlavni_klub_id` VARCHAR\(8\) NOT NULL/,
  );
  assert.match(sql, /CREATE TABLE `mcvv_klub_navrh_zamitnuty`[\s\S]*`klub_id_a` VARCHAR\(8\)/);
});
