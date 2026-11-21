import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isSectionId } from "@/lib/admin/permissions";
import {
  DEFAULT_PINS,
  defaultPins,
  MAX_PINS,
  PIN_NONE,
  storedPins,
  togglePinList,
} from "@/lib/admin/pins";
import { ADMIN_SECTIONS } from "@/lib/admin/sections";
import { STAFF_ROLES } from "@/lib/auth/staff-roles";

describe("admin pins (P6)", () => {
  const navIds = new Set(
    ADMIN_SECTIONS.flatMap((group) =>
      group.chapters.flatMap((chapter) => [chapter, ...(chapter.children ?? [])]),
    )
      .filter((item) => item.href !== undefined)
      .map((item) => item.id),
  );

  it("default pins exist for every role and point at nav pages", () => {
    for (const role of STAFF_ROLES) {
      assert.ok(DEFAULT_PINS[role].length > 0, role);
      for (const id of DEFAULT_PINS[role]) {
        assert.ok(isSectionId(id), `${role} ${id}`);
        assert.ok(navIds.has(id), `${role} ${id} není v panelu`);
      }
    }
  });

  it("defaults merge roles without duplicates, at most 6", () => {
    assert.deepEqual(defaultPins(["comms", "entries"]), [
      "messages",
      "newsletter",
      "entries.list",
      "entries.payments",
    ]);
    assert.ok(defaultPins([...STAFF_ROLES]).length <= 6);
    assert.deepEqual(defaultPins([]), []);
  });

  it("stored rows: none = defaults, sentinel = empty, ordered by pos", () => {
    assert.equal(storedPins([]), null);
    assert.deepEqual(storedPins([{ sectionId: PIN_NONE, pos: 0 }]), []);
    assert.deepEqual(
      storedPins([
        { sectionId: "b", pos: 1 },
        { sectionId: "a", pos: 0 },
      ]),
      ["a", "b"],
    );
  });

  it("toggle adds at the end, removes, caps the list", () => {
    assert.deepEqual(togglePinList(["a"], "b"), ["a", "b"]);
    assert.deepEqual(togglePinList(["a", "b"], "a"), ["b"]);
    const full = Array.from({ length: MAX_PINS }, (_, i) => `s${i}`);
    assert.equal(togglePinList(full, "x").length, MAX_PINS);
    assert.equal(togglePinList(full, "x").at(-1), "x");
  });
});
