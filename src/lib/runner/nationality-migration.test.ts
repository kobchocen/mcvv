import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const SQL = readFileSync(
  new URL(
    "../../../prisma/migrations/20261106120000_runner_nationality_cz/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const statements = SQL.split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.replace(/\s+/g, " ").trim())
  .filter(Boolean);

describe("migration runner_nationality_cz", () => {
  it("fills CZ only for runners without a country (idempotent)", () => {
    assert.equal(statements.length, 2);
    assert.equal(
      statements[0],
      "UPDATE `cis_bezec` SET `statni_prislusnost` = 'CZ' WHERE `statni_prislusnost` IS NULL OR TRIM(`statni_prislusnost`) = ''",
    );
  });

  it("only sets the column default, keeps it nullable and deletes nothing", () => {
    assert.equal(
      statements[1],
      "ALTER TABLE `cis_bezec` MODIFY `statni_prislusnost` CHAR(2) NULL DEFAULT 'CZ'",
    );
    assert.doesNotMatch(SQL, /\b(DROP|DELETE|TRUNCATE|INSERT)\b/i);
  });
});
