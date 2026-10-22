import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync(
  new URL(
    "../../../prisma/migrations/20261022150000_club_merge_rewrite/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const statements = sql
  .replace(/^\s*--.*$/gm, "")
  .split(";")
  .map((part) => part.trim())
  .filter(Boolean);
const index = (pattern: RegExp) => statements.findIndex((statement) => pattern.test(statement));

test("migrace sloučení: audit se stavem před přepisem jde před jakoukoli změnou dat", () => {
  const audit = index(/^INSERT INTO `mcvv_audit_log`/);
  const firstChange = index(/^(UPDATE|DELETE|INSERT INTO `cis_klub`)/);
  assert.ok(audit >= 0 && audit < firstChange);
  assert.match(statements[audit], /'club\.merge'/);
});

test("migrace sloučení: pořadí kroků drží cizí klíče (doplnit, převést, přepsat, smazat)", () => {
  const create = index(/^INSERT INTO `cis_klub`/);
  const move = index(/^UPDATE `cis_klub`/);
  const rows = ["mcvv_prihlaska_radek", "mcvv_start", "mcvv_time"].map((table) =>
    index(new RegExp(`^UPDATE \`${table}\``)),
  );
  const drop = index(/^DELETE k FROM `cis_klub`/);
  assert.ok(create >= 0 && create < move);
  for (const row of rows) assert.ok(row > move && row < drop);
});

test("migrace sloučení: tabulka sloučení i pomocný plán se ruší, legacy tabulky zůstávají", () => {
  assert.match(sql, /DROP TABLE `mcvv_klub_slouceni`/);
  assert.match(sql, /DROP TABLE `_mcvv_klub_slouceni_plan`/);
  for (const table of ["cis_klub", "mcvv_prihlaska_radek", "mcvv_start", "mcvv_time"]) {
    assert.doesNotMatch(sql, new RegExp(`DROP TABLE \`${table}\``));
  }
  assert.doesNotMatch(sql, /FOREIGN_KEY_CHECKS/);
});
