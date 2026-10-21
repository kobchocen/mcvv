/**
 * Importy z OBD v adminu (#119 po prezentaci, #123 výsledky, PR #143) smí nahrát admin,
 * organizer i Časomíra (`timing`, LuM). Ostatní role ne. Kontroluje stránky, server actions
 * (jiné API pro importy není), proxy i cíl po přihlášení.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { adminGate } from "@/lib/auth/admin-gate";
import {
  adminAccess,
  adminPathAllowed,
  canAccessRaceDay,
  USER_ROLES,
  type UserRole,
} from "@/lib/auth/roles";
import { loginTarget } from "@/lib/auth/safe-next";

const ROOT = join(import.meta.dirname, "..", "..");
const IMPORT_PATHS = ["/admin/den-zavodu/prezentace", "/admin/den-zavodu/vysledky"] as const;
const ALLOWED: readonly UserRole[] = ["admin", "organizer", "timing"];

describe("OBD imports – access for admin, organizer and Časomíra (timing)", () => {
  it("only admin, organizer and timing may open the import pages", () => {
    for (const role of USER_ROLES) {
      const expected = ALLOWED.includes(role);
      assert.equal(canAccessRaceDay(role), expected, role);
      for (const path of IMPORT_PATHS) {
        assert.equal(adminPathAllowed(adminAccess(role), path), expected, `${role} ${path}`);
      }
    }
  });

  it("timing passes the admin proxy on the import pages, registrar and splitmaker are sent to login", () => {
    const base = { method: "GET", isRscOrAction: false, search: "" } as const;
    for (const path of IMPORT_PATHS) {
      for (const role of USER_ROLES) {
        const decision = adminGate({ ...base, pathname: `/cs${path}`, cookieRole: role });
        assert.equal(
          decision.kind,
          ALLOWED.includes(role) ? "pass" : "redirect",
          `${role} ${path}`,
        );
      }
    }
  });

  it("after login timing lands on the requested import page", () => {
    for (const path of IMPORT_PATHS) {
      assert.deepEqual(loginTarget(path, "raceday", "timing"), { kind: "admin", next: path });
    }
  });

  it("import pages are guarded by requireRaceDay, not a staff-only guard", () => {
    for (const sub of ["prezentace", "vysledky"]) {
      const page = readFileSync(
        join(ROOT, `app/[locale]/admin/den-zavodu/${sub}/page.tsx`),
        "utf8",
      );
      assert.match(page, /await requireRaceDay\(\)/, sub);
      assert.doesNotMatch(page, /requireStaff|requireAdmin|isStaffRole/, sub);
    }
  });

  it("import server actions check requireRaceDay first and nothing stricter", () => {
    const source = readFileSync(join(ROOT, "lib/raceday/import-actions.ts"), "utf8");
    assert.doesNotMatch(source, /requireStaff|requireAdmin|isStaffRole|canManageLiveResults/);
    const bodies = source.split(/\nexport async function /).slice(1);
    assert.deepEqual(
      bodies.map((body) => body.slice(0, body.indexOf("("))),
      ["presentationImportAction", "resultsImportAction"],
    );
    for (const body of bodies) {
      const guard = body.indexOf("await requireRaceDay()");
      assert.ok(guard >= 0 && guard < body.indexOf("formData.get"));
    }
  });

  it("the race-day hub links both imports for every race-day role", () => {
    const hub = readFileSync(join(ROOT, "app/[locale]/admin/den-zavodu/page.tsx"), "utf8");
    for (const path of IMPORT_PATHS) {
      const link = hub.indexOf(`href="${path}"`);
      assert.ok(link > 0, path);
      // odkaz nesmí být uvnitř podmínky jen pro staff / admina
      const before = hub.slice(Math.max(0, hub.lastIndexOf("{", link)), link);
      assert.doesNotMatch(before, /isStaffRole|canManageLiveResults/, path);
    }
  });
});
