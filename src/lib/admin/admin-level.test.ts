import assert from "node:assert/strict";
import { test } from "node:test";

import { adminLevelOf } from "./admin-level";
import { adminGate } from "@/lib/auth/admin-gate";
import { USER_ROLES, type UserRole } from "@/lib/auth/roles";
import { loginTarget } from "@/lib/auth/safe-next";
import { grantsFromLegacyRole, STAFF_ROLES, type StaffRole } from "@/lib/auth/staff-roles";
import { overrideKey, SECTION_IDS, type StoredLevel } from "./permissions";

test("v2 off: level follows today's role column", () => {
  assert.equal(adminLevelOf({ v2: false, role: "splitmaker", grants: [] }), "tools");
  assert.equal(adminLevelOf({ v2: false, role: "timing", grants: [] }), "raceday");
  assert.equal(adminLevelOf({ v2: false, role: "organizer", grants: [] }), "full");
  assert.equal(adminLevelOf({ v2: false, role: "registrar", grants: [] }), "none");
  assert.equal(adminLevelOf({ v2: false, role: null, grants: [] }), "none");
});

test("v2 off, view-as: the highest of the previewed roles", () => {
  const level = (roles: UserRole[]) =>
    adminLevelOf({ v2: false, role: "admin", grants: [], previewLegacyRoles: roles });
  assert.equal(level(["splitmaker"]), "tools");
  assert.equal(level(["splitmaker", "timing"]), "raceday");
  assert.equal(level(["registrar"]), "none");
});

test("v2 on: level comes from grants, not from the role column", () => {
  // Účet se sloupcem registrar, ale s rolí mezičasy v mcvv_user_role.
  assert.equal(adminLevelOf({ v2: true, role: "registrar", grants: ["splitmaker"] }), "full");
  assert.equal(adminLevelOf({ v2: true, role: "splitmaker", grants: [] }), "none");
  // Matice oprávnění odebere roli všechny sekce → žádný rozcestník ani kolečko.
  const overrides = new Map<string, StoredLevel>(
    SECTION_IDS.map((id) => [overrideKey("splitmaker", id), "none"]),
  );
  assert.equal(
    adminLevelOf({ v2: true, role: "splitmaker", grants: ["splitmaker"], overrides }),
    "none",
  );
});

/** Pro každou kombinaci: proxy → layout → přihlášení se nesmí točit dokola. */
function assertNoLoop(level: ReturnType<typeof adminLevelOf>, cookieRole: UserRole, label: string) {
  // Proxy pustí každou platnou session (roli ověří layout v DB).
  assert.equal(
    adminGate({
      method: "GET",
      isRscOrAction: false,
      search: "",
      pathname: "/cs/admin",
      cookieRole,
    }).kind,
    "pass",
    label,
  );
  // Layout bez přístupu přesměruje pryč z adminu; s přístupem renderuje. Přihlášení pošle
  // na /admin právě tehdy, když ho layout otevře.
  const target = loginTarget("/admin", level);
  assert.equal(target.kind === "admin", level !== "none", label);
}

test("no /admin ⇄ login loop for any role, with v2 off and on, even with a stale cookie role", () => {
  for (const dbRole of USER_ROLES) {
    for (const cookieRole of USER_ROLES) {
      assertNoLoop(
        adminLevelOf({ v2: false, role: dbRole, grants: [] }),
        cookieRole,
        `off ${dbRole}/${cookieRole}`,
      );
    }
  }
  const sets: StaffRole[][] = [[], ...STAFF_ROLES.map((role) => [role]), ["splitmaker", "speaker"]];
  for (const grants of sets) {
    for (const cookieRole of ["registrar", "splitmaker"] as const) {
      assertNoLoop(
        adminLevelOf({ v2: true, role: "registrar", grants }),
        cookieRole,
        `on ${grants.join("+")}`,
      );
    }
  }
  // Odvozené role ze sloupce (účet bez řádků v mcvv_user_role) dávají stejný výsledek jako dnes.
  assert.equal(
    adminLevelOf({ v2: true, role: "splitmaker", grants: grantsFromLegacyRole("splitmaker") }),
    "full",
  );
});
