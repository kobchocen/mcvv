import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adminAccess,
  adminHomeHref,
  adminPathAllowed,
  canAccessRaceDay,
  canAccessSplits,
  canChangeSaleStatus,
  canManageSaleItems,
  canMarkSalePaidBank,
  canMergeClubs,
  canManageLiveResults,
  canUseCashDesk,
  isStaffRole,
  requiresVerifiedEmail,
  USER_ROLES,
  validateRoleChange,
} from "./roles";

describe("role permissions", () => {
  it("race office (#207): cash desk for race_office and staff, price list and manual transfer admin only, no admin", () => {
    for (const role of USER_ROLES) {
      assert.equal(
        canUseCashDesk(role),
        role === "race_office" || role === "organizer" || role === "admin",
        role,
      );
      assert.equal(canManageSaleItems(role), role === "admin", role);
      // Q66: manual "paid by transfer" is admin only, organizer has nothing to do with it.
      assert.equal(canMarkSalePaidBank(role), role === "admin", role);
      const desk = role === "race_office" || role === "organizer" || role === "admin";
      assert.equal(canChangeSaleStatus(role, "paid_cash"), desk, role);
      assert.equal(canChangeSaleStatus(role, "cancelled"), desk, role);
      assert.equal(canChangeSaleStatus(role, "paid_bank"), role === "admin", role);
    }
    assert.equal(canMarkSalePaidBank("organizer"), false);
    assert.equal(canChangeSaleStatus("race_office", "paid_bank"), false);
    assert.equal(adminAccess("race_office"), "none");
    assert.equal(isStaffRole("race_office"), false);
    assert.equal(canAccessSplits("race_office"), false);
    assert.equal(requiresVerifiedEmail("race_office"), true);
  });
  it("club merge (preview and apply, Q47): admin only, not organizer", () => {
    for (const role of USER_ROLES) {
      assert.equal(canMergeClubs(role), role === "admin", role);
    }
  });

  it("splits client: splitmaker, organizer, admin; live results management: admin only", () => {
    for (const role of ["splitmaker", "organizer", "admin"] as const) {
      assert.ok(canAccessSplits(role), role);
    }
    for (const role of ["registrar", "timing"] as const) {
      assert.ok(!canAccessSplits(role), role);
    }
    for (const role of USER_ROLES) {
      assert.equal(canManageLiveResults(role), role === "admin", role);
    }
  });

  it("timing sees only the race-day section", () => {
    assert.equal(adminAccess("timing"), "raceday");
    assert.ok(canAccessRaceDay("timing"));
    assert.ok(!isStaffRole("timing"));
    assert.ok(!canAccessSplits("timing"));
    assert.ok(adminPathAllowed("raceday", "/admin/den-zavodu"));
    assert.ok(adminPathAllowed("raceday", "/admin/den-zavodu/import"));
    for (const path of [
      "/admin",
      "/admin/prihlasky",
      "/admin/platby",
      "/admin/nastaveni",
      "/admin/newsletter",
      "/admin/ciselniky",
      "/admin/uzivatele",
      "/admin/den-zavodu-x",
    ]) {
      assert.ok(!adminPathAllowed("raceday", path), path);
    }
    assert.equal(adminHomeHref("timing"), "/admin/den-zavodu");
  });
  it("splitmaker and registrar have no administration", () => {
    for (const role of ["splitmaker", "registrar"] as const) {
      assert.equal(adminAccess(role), "none");
      assert.ok(!canAccessRaceDay(role));
      assert.ok(!adminPathAllowed(adminAccess(role), "/admin/den-zavodu"));
    }
    assert.ok(canAccessSplits("splitmaker"));
  });
  it("organizer and admin keep full access including race day", () => {
    for (const role of ["organizer", "admin"] as const) {
      assert.equal(adminAccess(role), "full");
      assert.ok(canAccessRaceDay(role));
      assert.ok(canAccessSplits(role));
      assert.equal(adminHomeHref(role), "/admin");
    }
  });
  it("new restricted roles need a verified e-mail like registrar", () => {
    assert.deepEqual(
      USER_ROLES.filter((role) => requiresVerifiedEmail(role)),
      ["registrar", "timing", "splitmaker", "race_office"],
    );
  });
});

describe("validateRoleChange", () => {
  const target = { id: 2, role: "registrar" as const, emailVerified: true };
  it("allows an admin to grant timing to a verified account", () => {
    assert.deepEqual(validateRoleChange({ actorId: 1, target, newRole: "timing", adminCount: 1 }), {
      ok: true,
      role: "timing",
    });
  });
  it("rejects unknown roles and no-op changes", () => {
    assert.deepEqual(validateRoleChange({ actorId: 1, target, newRole: "root", adminCount: 1 }), {
      ok: false,
      error: "invalid_role",
    });
    assert.deepEqual(
      validateRoleChange({ actorId: 1, target, newRole: "registrar", adminCount: 1 }),
      { ok: false, error: "same_role" },
    );
  });
  it("an admin cannot change their own role", () => {
    assert.deepEqual(
      validateRoleChange({
        actorId: 2,
        target: { ...target, role: "admin" },
        newRole: "organizer",
        adminCount: 3,
      }),
      { ok: false, error: "self_change" },
    );
  });
  it("the last admin cannot be demoted", () => {
    const lastAdmin = { id: 5, role: "admin" as const, emailVerified: true };
    assert.deepEqual(
      validateRoleChange({ actorId: 1, target: lastAdmin, newRole: "organizer", adminCount: 1 }),
      { ok: false, error: "last_admin" },
    );
    assert.deepEqual(
      validateRoleChange({ actorId: 1, target: lastAdmin, newRole: "organizer", adminCount: 2 }),
      { ok: true, role: "organizer" },
    );
  });
  it("privileged roles only for verified e-mail; demotion always allowed", () => {
    const unverified = { id: 3, role: "registrar" as const, emailVerified: false };
    for (const role of ["organizer", "admin", "timing", "splitmaker"]) {
      assert.deepEqual(
        validateRoleChange({ actorId: 1, target: unverified, newRole: role, adminCount: 1 }),
        { ok: false, error: "unverified" },
      );
    }
    assert.deepEqual(
      validateRoleChange({
        actorId: 1,
        target: { id: 4, role: "timing", emailVerified: false },
        newRole: "registrar",
        adminCount: 1,
      }),
      { ok: true, role: "registrar" },
    );
  });
});
