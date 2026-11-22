import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { can, canOpenAdmin, type Access } from "./access";

const admin = { id: 1, email: "a@x", name: "A", role: "admin" as const };

function legacyPreview(roles: ("organizer" | "timing" | "splitmaker")[]): Access {
  return {
    session: { ...admin, role: roles.includes("organizer") ? "organizer" : roles[0]! },
    v2: false,
    grants: [],
    overrides: new Map(),
    preview: { mode: "legacy", roles, legacyRoles: roles, realSession: admin, exp: 0 },
  };
}

describe("view as role (access engine)", () => {
  it("flag off: preview uses the union of the selected legacy roles", () => {
    const timing = legacyPreview(["timing"]);
    assert.equal(canOpenAdmin(timing), true);
    assert.equal(can(timing, "settings", "read"), false);
    assert.equal(can(timing, "users", "read"), false);
    const organizer = legacyPreview(["organizer"]);
    assert.equal(can(organizer, "users", "read"), false);
    assert.equal(can(organizer, "entries.list", "write"), true);
    assert.equal(can(timing, "raceControl.overview", "read"), true);
    assert.equal(can(legacyPreview(["splitmaker"]), "raceControl.overview", "read"), false);
    assert.equal(can(legacyPreview(["splitmaker"]), "screens.splits", "read"), true);
    const both = legacyPreview(["timing", "splitmaker"]);
    assert.equal(can(both, "screens.splits", "read"), true);
    assert.equal(
      can(both, "raceControl.overview", "read"),
      can(legacyPreview(["timing"]), "raceControl.overview", "read") ||
        can(legacyPreview(["splitmaker"]), "raceControl.overview", "read"),
    );
  });

  it("flag off without preview stays exactly the legacy role", () => {
    const plain: Access = { session: admin, v2: false, grants: [], overrides: new Map() };
    assert.equal(can(plain, "settings", "write"), true);
    assert.equal(canOpenAdmin(plain), true);
  });

  it("flag on: preview uses the selected grants and the matrix", () => {
    const speaker: Access = {
      session: { ...admin, role: "registrar" },
      v2: true,
      grants: ["speaker"],
      overrides: new Map(),
      preview: { mode: "v2", roles: ["speaker"], legacyRoles: [], realSession: admin, exp: 0 },
    };
    assert.equal(can(speaker, "settings", "read"), false);
    assert.equal(can(speaker, "permissions", "read"), false);
  });
});
