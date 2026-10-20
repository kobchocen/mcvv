import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { NOTES_MIGRATED_YEAR } from "./core";

const sql = readFileSync(
  new URL("../../../prisma/migrations/20261020180000_messages/migration.sql", import.meta.url),
  "utf8",
);
const statements = sql
  .split(";")
  .map((part) => part.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

test("migrace: převádí jen neprázdné poznámky převedeného ročníku", () => {
  const inserts = statements.filter((statement) => statement.startsWith("INSERT INTO"));
  assert.equal(inserts.length, 2, "vlákna + první zprávy");
  for (const insert of inserts) {
    assert.match(insert, new RegExp(`\\.\`rok\` = ${NOTES_MIGRATED_YEAR}\\b`));
    assert.match(insert, /`poznamka` IS NOT NULL/);
    // Jen CR/LF či mezery se nepřevádí (TRIM by "\r\n" nechal).
    assert.match(insert, /`poznamka` REGEXP '\[\^\[:space:\]\]'/);
  }
});

test("migrace: první zpráva je od přihlašujícího a pro pořadatele přečtená", () => {
  const [threads, messages] = statements.filter((statement) => statement.startsWith("INSERT INTO"));
  assert.match(threads!, /`last_read_by_staff`/);
  assert.match(threads!, /'open'/);
  assert.match(messages!, /'user'/);
});

test("migrace: sloupec poznamka zůstává (žádný DROP ani UPDATE legacy tabulky)", () => {
  assert.doesNotMatch(sql, /DROP\s+COLUMN/i);
  assert.doesNotMatch(sql, /ALTER TABLE `mcvv_prihlaska`/i);
  assert.doesNotMatch(sql, /UPDATE `mcvv_prihlaska`/i);
});

test("migrace: nový druh e-mailu message ve frontě", () => {
  assert.match(sql, /MODIFY `kind` ENUM\([^)]*'message'\)/);
});
