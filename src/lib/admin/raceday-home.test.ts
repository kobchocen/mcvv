import assert from "node:assert/strict";
import { test } from "node:test";

import { legacyAllows, v2Allows, type AccessLevel, type SectionId } from "./permissions";
import { raceDayTiles } from "./raceday-home";
import type { UserRole } from "@/lib/auth/roles";
import type { StaffRole } from "@/lib/auth/staff-roles";

const legacy = (role: UserRole) => (id: SectionId, level: AccessLevel) =>
  legacyAllows(role, id, level);
const v2 = (grants: StaffRole[]) => (id: SectionId, level: AccessLevel) =>
  v2Allows(grants, id, level);
const hrefs = (allows: (id: SectionId, level: AccessLevel) => boolean) =>
  raceDayTiles(allows).map((tile) => tile.href);

test("v2 off: splitmaker gets the split entry tile, other race-day roles their screens", () => {
  assert.deepEqual(hrefs(legacy("splitmaker")), ["/mezicasy"]);
  assert.deepEqual(hrefs(legacy("starter")), ["/start"]);
  assert.deepEqual(hrefs(legacy("race_office")), ["/kancelar"]);
  assert.ok(hrefs(legacy("timing")).includes("/admin/den-zavodu"));
});

test("v2 on: splitmaker grant gets the split entry tile", () => {
  assert.ok(hrefs(v2(["splitmaker"])).includes("/mezicasy"));
});

test("a role with screens but no own tile gets the screens hub, never an empty page", () => {
  const screensOnly = (id: SectionId) => id === "screens" || id === "screens.speaker";
  assert.deepEqual(hrefs(screensOnly), ["/admin/obrazovky"]);
  assert.ok(hrefs(v2(["speaker"])).length > 0);
  assert.deepEqual(
    hrefs(() => false),
    [],
  );
});
