import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultLevel,
  legacyAllows,
  screenAllowsFor,
  prestarterScope,
  starterScope,
  v2Allows,
} from "@/lib/admin/permissions";
import { defaultPins } from "@/lib/admin/pins";
import { raceDayTiles } from "@/lib/admin/raceday-home";
import { roleHomePath } from "@/lib/admin/role-change-mail";
import { viewAsSessionRole } from "@/lib/admin/view-as-core";
import { adminAccess, canAccessPrestarter, canAccessScreens } from "@/lib/auth/roles";
import { postLoginTarget, safeNext } from "@/lib/auth/safe-next";
import { grantsFromLegacyRole, primaryLegacyRole } from "@/lib/auth/staff-roles";
import { prestarterAccessFor } from "@/lib/live/prestarter-core";

describe("Předstartér (#379) – role a oprávnění", () => {
  it("v1: role Předstartér otevře jen svou obrazovku a rozcestník nástrojů", () => {
    assert.equal(canAccessPrestarter("prestarter"), true);
    assert.equal(canAccessPrestarter("organizer"), true);
    assert.equal(canAccessPrestarter("admin"), true);
    assert.equal(canAccessPrestarter("starter"), false);
    assert.equal(canAccessScreens("prestarter"), true);
    assert.equal(adminAccess("prestarter"), "tools");
    assert.equal(legacyAllows("prestarter", "screens.prestarter", "write"), true);
    assert.equal(legacyAllows("prestarter", "screens.starter", "read"), false);
    assert.equal(legacyAllows("prestarter", "raceControl.start", "read"), false);
    assert.equal(legacyAllows("starter", "screens.prestarter", "read"), false);
  });

  it("v1: Startér s grantem Předstartér dostane obrazovku předstartéra (jen svůj koridor)", () => {
    const allows = screenAllowsFor({
      v2: false,
      role: "starter",
      grants: ["starter", "prestarter"],
    });
    assert.equal(allows("screens.prestarter", "write"), true);
    assert.equal(allows("screens.starter", "read"), true);
    assert.equal(allows("raceControl.start", "read"), false);
    assert.deepEqual(prestarterScope(allows), { any: false, own: true });
    assert.deepEqual(prestarterAccessFor(prestarterScope(allows), 1, "2"), {
      ok: true,
      corridor: 1,
      allowed: 1,
      canSwitch: false,
    });
  });

  it("v1: Startér bez grantu obrazovku předstartéra nemá", () => {
    const allows = screenAllowsFor({ v2: false, role: "starter", grants: ["starter"] });
    assert.equal(allows("screens.prestarter", "read"), false);
    assert.deepEqual(prestarterScope(allows), { any: false, own: false });
  });

  it("v1: pořadatel a admin mají přepínač koridoru", () => {
    for (const role of ["organizer", "admin"] as const) {
      const allows = screenAllowsFor({ v2: false, role, grants: [] });
      assert.deepEqual(prestarterScope(allows), { any: true, own: true }, role);
    }
  });

  it("v2: sjednocení grantů, výchozí matice role Předstartér", () => {
    const allows = screenAllowsFor({
      v2: true,
      role: "registrar",
      grants: ["splitmaker", "prestarter"],
    });
    assert.equal(allows("screens.prestarter", "write"), true);
    assert.equal(allows("screens.splits", "write"), true);
    assert.deepEqual(prestarterScope(allows), { any: false, own: true });
    assert.equal(defaultLevel("prestarter", "screens.prestarter"), "write");
    assert.equal(defaultLevel("prestarter", "screens"), "write");
    assert.equal(defaultLevel("prestarter", "overview"), "write");
    assert.equal(defaultLevel("prestarter", "screens.starter"), "none");
    assert.equal(defaultLevel("prestarter", "raceControl.start"), "none");
    assert.equal(defaultLevel("starter", "screens.prestarter"), "none");
    assert.equal(defaultLevel("timing_ops", "screens.prestarter"), "write");
    assert.equal(v2Allows(["timing_ops"], "raceControl.start", "read"), true);
    assert.deepEqual(
      starterScope((id, level) => v2Allows(["prestarter"], id, level)),
      {
        any: false,
        own: false,
      },
    );
  });

  it("role ve sloupci ↔ granty, náhled, připnutí, dlaždice, e-mail a přihlášení", () => {
    assert.deepEqual(grantsFromLegacyRole("prestarter"), ["prestarter"]);
    assert.equal(primaryLegacyRole(["prestarter"]), "prestarter");
    assert.equal(primaryLegacyRole(["starter", "prestarter"]), "starter");
    assert.equal(primaryLegacyRole(["splitmaker", "prestarter"]), "prestarter");
    assert.equal(viewAsSessionRole("legacy", ["prestarter"]), "prestarter");
    assert.deepEqual(defaultPins(["prestarter"]), ["screens.prestarter"]);
    assert.deepEqual(
      raceDayTiles((id, level) => legacyAllows("prestarter", id, level)),
      [{ href: "/predstarter", key: "navPrestarter" }],
    );
    assert.equal(roleHomePath("prestarter"), "/predstarter");
    assert.equal(safeNext("/predstarter"), "/predstarter");
    assert.deepEqual(postLoginTarget("/predstarter", "prestarter"), {
      kind: "user",
      path: "/predstarter",
      query: "",
    });
  });
});
