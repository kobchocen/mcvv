import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LEGACY_PREDICATES,
  SECTION_IDS,
  SECTION_RULES,
  SYSTEM_ONLY_SECTIONS,
  legacyAllows,
  EDITABLE_ROLES,
  EDITABLE_SECTIONS,
  matrixField,
  overrideKey,
  parseMatrixForm,
  planMatrixChange,
  resetChanges,
  splitScope,
  starterScope,
  v2Allows,
  v2HasAdminHome,
  type AccessLevel,
} from "@/lib/admin/permissions";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";
import { hasAdminHome, isStaffRole, type UserRole } from "@/lib/auth/roles";
import { stationsForScope, allowedStationsFor } from "@/lib/live/assignment-core";
import { starterAccess, starterAccessFor } from "@/lib/live/starter-api-core";
import { grantsFromLegacyRole } from "@/lib/auth/staff-roles";

const ROLES: UserRole[] = [
  "registrar",
  "organizer",
  "admin",
  "timing",
  "splitmaker",
  "race_office",
  "starter",
];
const LEVELS: AccessLevel[] = ["read", "write"];

describe("permissions engine – ekvivalence s dnešními rolemi", () => {
  // timing → timing_ops dostává v nové matici víc (P3/P4 návrh), proto zvlášť níž.
  const EXACT = ROLES.filter((role) => role !== "timing");

  for (const role of EXACT) {
    it(`v2 s rolemi odvozenými z „${role}“ = dnešní stráže ve všech sekcích`, () => {
      const grants = grantsFromLegacyRole(role);
      for (const id of SECTION_IDS) {
        for (const level of LEVELS) {
          assert.equal(
            v2Allows(grants, id, level),
            legacyAllows(role, id, level),
            `${role} ${id} ${level}`,
          );
        }
      }
      assert.equal(v2HasAdminHome(grants), hasAdminHome(role));
    });
  }

  it("timing: v2 je nadmnožina dnešních práv", () => {
    const grants = grantsFromLegacyRole("timing");
    for (const id of SECTION_IDS) {
      for (const level of LEVELS) {
        if (legacyAllows("timing", id, level)) {
          assert.equal(v2Allows(grants, id, level), true, `timing ${id} ${level}`);
        }
      }
    }
    assert.equal(v2HasAdminHome(grants), true);
  });

  it("zápis vždy implikuje čtení (legacy i v2)", () => {
    for (const role of ROLES) {
      for (const id of SECTION_IDS) {
        if (legacyAllows(role, id, "write")) assert.equal(legacyAllows(role, id, "read"), true);
        const grants = grantsFromLegacyRole(role);
        if (v2Allows(grants, id, "write")) assert.equal(v2Allows(grants, id, "read"), true);
      }
    }
  });

  it("navigace: položka je vidět právě když legacy čtení sekce", () => {
    const items = ADMIN_SECTIONS.flatMap((group) =>
      group.chapters.flatMap((chapter) => [chapter, ...(chapter.children ?? [])]),
    );
    // Kapitoly bez vlastní stránky (jen rozbalovací) nemají vlastní sekci.
    for (const item of items.filter((entry) => entry.href !== undefined)) {
      assert.ok(item.id in SECTION_RULES, `sekce ${item.id} chybí v SECTION_RULES`);
      if (!item.allowed) continue;
      for (const role of ROLES) {
        assert.equal(
          legacyAllows(role, item.id as keyof typeof SECTION_RULES, "read"),
          item.allowed(role),
          `${role} ${item.id}`,
        );
      }
    }
  });

  it("legacy predikáty pokrývají všechny stráže v pravidlech", () => {
    for (const id of SECTION_IDS) {
      assert.equal(typeof LEGACY_PREDICATES[SECTION_RULES[id].read], "function");
      assert.equal(typeof LEGACY_PREDICATES[SECTION_RULES[id].write], "function");
    }
  });
});

describe("permissions engine – úpravy matice", () => {
  it("admin má vždy zápis, i když ho matice ubere", () => {
    const overrides = new Map([[overrideKey("admin", "audit"), "none" as const]]);
    assert.equal(v2Allows(["admin"], "audit", "write", overrides), true);
  });

  it("úprava matice přidá i ubere právo", () => {
    const add = new Map([[overrideKey("speaker", "newsletter"), "read" as const]]);
    assert.equal(v2Allows(["speaker"], "newsletter", "read"), false);
    assert.equal(v2Allows(["speaker"], "newsletter", "read", add), true);
    assert.equal(v2Allows(["speaker"], "newsletter", "write", add), false);
    const remove = new Map([[overrideKey("entries", "entries.list"), "none" as const]]);
    assert.equal(v2Allows(["entries"], "entries.list", "read", remove), false);
  });

  it("Uživatelé a Nastavení jen pro admina, matice je nepovolí", () => {
    for (const id of SYSTEM_ONLY_SECTIONS) {
      const overrides = new Map([[overrideKey("organizer_legacy", id), "write" as const]]);
      assert.equal(v2Allows(["organizer_legacy"], id, "read", overrides), false);
    }
  });

  it("více rolí = maximum práv", () => {
    assert.equal(v2Allows(["speaker", "entries"], "entries.list", "write"), true);
    assert.equal(v2Allows(["speaker"], "entries.list", "write"), false);
  });
});

describe("screens outside /admin (P5) – flag off = today", () => {
  const stations = [
    { code: "A", name: "A" },
    { code: "B", name: "B" },
  ] as unknown as Parameters<typeof stationsForScope>[2];
  for (const role of ROLES) {
    const legacy = (id: (typeof SECTION_IDS)[number], level: AccessLevel) =>
      legacyAllows(role, id, level);
    it(`splits and starter scope for ${role}`, () => {
      assert.deepEqual(
        stationsForScope(splitScope(legacy), "A", stations),
        allowedStationsFor(role, "A", stations),
      );
      for (const assigned of [null, 1, 2] as const) {
        for (const requested of [undefined, "2"]) {
          assert.deepEqual(
            starterAccessFor(starterScope(legacy), assigned, requested),
            starterAccess(role, assigned, requested),
            `${role} ${assigned} ${requested}`,
          );
        }
      }
      assert.equal(splitScope(legacy).all, isStaffRole(role));
    });
  }
});

describe("permissions editor (P8)", () => {
  it("editable cells exclude admin, overview and admin-only sections", () => {
    assert.ok(!EDITABLE_ROLES.includes("admin"));
    for (const id of ["overview", "users", "settings", "permissions"] as const) {
      assert.ok(!EDITABLE_SECTIONS.includes(id), id);
    }
  });

  it("parses the form and drops anything unexpected", () => {
    const parsed = parseMatrixForm([
      [matrixField("speaker", "newsletter"), "read"],
      ["m|admin|newsletter", "none"],
      ["m|speaker|users", "write"],
      ["m|speaker|newsletter|x", "write"],
      [matrixField("entries", "entries.list"), "root"],
      ["other", "write"],
    ]);
    assert.deepEqual([...parsed], [[overrideKey("speaker", "newsletter"), "read"]]);
  });

  it("stores only differences from defaults and audits effective changes", () => {
    const overrides = new Map([[overrideKey("comms", "partners"), "write" as const]]);
    const submitted = new Map([
      [overrideKey("speaker", "newsletter"), "read" as const], // new override
      [overrideKey("comms", "partners"), "none" as const], // back to default → delete
      [overrideKey("entries", "entries.list"), "write" as const], // unchanged default
    ]);
    const plan = planMatrixChange(overrides, submitted);
    assert.deepEqual(plan.upserts, [{ role: "speaker", sectionId: "newsletter", level: "read" }]);
    assert.deepEqual(plan.deletes, [{ role: "comms", sectionId: "partners" }]);
    assert.deepEqual(plan.changes, {
      "comms/partners": { before: "write", after: "none" },
      "speaker/newsletter": { before: "none", after: "read" },
    });
  });

  it("reset reports every override that differs from the default", () => {
    const overrides = new Map([
      [overrideKey("comms", "partners"), "write" as const],
      [overrideKey("entries", "entries.list"), "write" as const],
    ]);
    assert.deepEqual(resetChanges(overrides), {
      "comms/partners": { before: "write", after: "none" },
    });
  });

  it("the editor page is an admin-only nav item", () => {
    for (const role of ROLES) {
      assert.equal(legacyAllows(role, "permissions", "read"), role === "admin", role);
    }
    const overrides = new Map([[overrideKey("organizer_legacy", "permissions"), "write" as const]]);
    assert.equal(v2Allows(["organizer_legacy"], "permissions", "read", overrides), false);
  });
});
