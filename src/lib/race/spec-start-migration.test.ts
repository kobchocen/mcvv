import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const SQL = readFileSync(
  new URL(
    "../../../prisma/migrations/20261102120000_spec_start_data/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const statements = SQL.split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

describe("migration spec_start_data (Q220, Q225)", () => {
  it("has two inserts and keeps the groups table and columns", () => {
    assert.equal(statements.length, 2);
    for (const s of statements) {
      assert.match(s, /^INSERT INTO `mcvv_spec_start`/);
      assert.match(
        s,
        /AND NOT EXISTS \(\s*SELECT 1 FROM `mcvv_spec_start` s WHERE s\.`rok` = \w+\.`rok` AND s\.`bezec_id` = \w+\.`bezec_id`/,
      );
    }
    assert.doesNotMatch(SQL, /\b(DROP|DELETE|TRUNCATE|ALTER|UPDATE)\b/i);
  });

  it("flags registration #1 of the current year as organizers first", () => {
    const [organizers] = statements;
    assert.match(organizers, /'organizer', NULL, 0/);
    assert.match(organizers, /r\.`prihlaska_id` = 1/);
    assert.match(
      organizers,
      /r\.`rok` = \(SELECT YEAR\(i\.`datum`\) FROM `mcvv_info` i ORDER BY i\.`datum` DESC, i\.`id` DESC LIMIT 1\)/,
    );
  });

  it("turns groups into „spolu s“ the first member as anchor", () => {
    const groups = statements[1];
    assert.match(groups, /'with', a\.`bezec_id`/);
    assert.match(groups, /ORDER BY sr\.`skupina_poradi`, sr\.`bezec_id`/);
    assert.match(groups, /WHERE x\.`rn` = 1/);
    assert.match(groups, /WHERE m\.`rn` > 1/);
    // společný start: dvojice na stejný čas, navazující: o interval za sebou, max. 60 min
    assert.match(groups, /WHEN 'joint' THEN FLOOR\(\(m\.`rn` - 1\) \/ 2\)/);
    assert.match(groups, /ELSE m\.`rn` - 1/);
    assert.match(groups, /LEAST\(3600,/);
    assert.match(groups, /NULLIF\(i\.`st_interval`, 0\)[\s\S]*15\) AS `interval_s`/);
  });
});
