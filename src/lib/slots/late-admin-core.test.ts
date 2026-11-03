import assert from "node:assert/strict";
import test from "node:test";

import { ENTRY_STATUS } from "@/lib/entries/status-codes";

import { extendedPayUntil, lateAdminActionsAllowed } from "./late-core";

const at = (iso: string) => new Date(iso);

test("extend +60 min: from the deadline, or from now when the deadline passed", () => {
  const payUntil = at("2026-12-03T12:32:00Z");
  assert.equal(
    extendedPayUntil(payUntil, at("2026-12-03T12:00:00Z")).toISOString(),
    "2026-12-03T13:32:00.000Z",
  );
  assert.equal(
    extendedPayUntil(payUntil, at("2026-12-03T12:40:00Z")).toISOString(),
    "2026-12-03T13:40:00.000Z",
  );
});

test("admin late actions only for a submitted, unpaid, not cancelled late entry", () => {
  const base = {
    status: ENTRY_STATUS.unpaid as number | null,
    slot: "late" as const,
    submittedAt: at("2026-12-03T11:32:00Z") as Date | null,
    payUntil: at("2026-12-03T12:32:00Z") as Date | null,
  };
  assert.equal(lateAdminActionsAllowed(base), true);
  assert.equal(lateAdminActionsAllowed({ ...base, status: ENTRY_STATUS.paid }), false);
  assert.equal(lateAdminActionsAllowed({ ...base, status: ENTRY_STATUS.confirmed }), false);
  assert.equal(lateAdminActionsAllowed({ ...base, status: ENTRY_STATUS.cancelled }), false);
  assert.equal(lateAdminActionsAllowed({ ...base, submittedAt: null }), false);
  assert.equal(lateAdminActionsAllowed({ ...base, slot: "standard" as never }), false);
});
