import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { USER_ROLES } from "./roles";
import { grantsFromLegacyRole, isStaffRoleCode, permissionsV2On, STAFF_ROLES } from "./staff-roles";

describe("staff roles (permissions v2)", () => {
  it("codes fit the VARCHAR(24) column and are unique", () => {
    assert.equal(new Set(STAFF_ROLES).size, STAFF_ROLES.length);
    for (const role of STAFF_ROLES) assert.ok(role.length <= 24, role);
  });

  it("every legacy role maps to valid codes, nobody loses access", () => {
    for (const role of USER_ROLES) {
      for (const grant of grantsFromLegacyRole(role)) assert.ok(isStaffRoleCode(grant), grant);
    }
    assert.deepEqual(grantsFromLegacyRole("registrar"), []);
    assert.deepEqual(grantsFromLegacyRole("organizer"), ["organizer_legacy"]);
    assert.deepEqual(grantsFromLegacyRole("timing"), ["timing_ops"]);
    assert.deepEqual(grantsFromLegacyRole("admin"), ["admin"]);
    assert.deepEqual(grantsFromLegacyRole("starter"), ["starter"]);
  });

  it("the migration backfill uses the same mapping", () => {
    const sql = readFileSync(
      join(process.cwd(), "prisma/migrations/20261121150000_admin_permissions/migration.sql"),
      "utf8",
    );
    assert.match(sql, /WHEN 'organizer' THEN 'organizer_legacy'/);
    assert.match(sql, /WHEN 'timing' THEN 'timing_ops'/);
    assert.match(sql, /WHERE `role` <> 'registrar'/);
    assert.match(sql, /INSERT IGNORE/);
    assert.doesNotMatch(sql, /ALTER TABLE `mcvv_(user|audit_log|setting)` /);
    assert.doesNotMatch(sql, /\bDROP\b/);
  });

  it("the v2 flag is off unless exactly 1", () => {
    assert.equal(permissionsV2On(undefined), false);
    assert.equal(permissionsV2On(null), false);
    assert.equal(permissionsV2On(""), false);
    assert.equal(permissionsV2On("true"), false);
    assert.equal(permissionsV2On("1"), true);
    assert.equal(permissionsV2On(" 1 "), true);
  });
});
