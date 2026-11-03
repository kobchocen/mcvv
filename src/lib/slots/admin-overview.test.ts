import assert from "node:assert/strict";
import test from "node:test";

import { ENTRY_STATUS } from "@/lib/entries/status-codes";

import { entrySlot, lateAdminState, minutesSeconds, parseSlotFilter } from "./admin-overview";

const at = (iso: string) => new Date(iso);
const now = at("2026-12-05T12:00:00Z");
const base = {
  status: ENTRY_STATUS.unpaid as number | null,
  submittedAt: at("2026-12-05T11:30:00Z") as Date | null,
  payUntil: at("2026-12-05T12:30:00Z") as Date | null,
  autoCancelledAt: null as Date | null,
};

test("slot filter and missing slot = standard", () => {
  assert.equal(parseSlotFilter("late"), "late");
  assert.equal(parseSlotFilter("onsite"), "onsite");
  assert.equal(parseSlotFilter(""), null);
  assert.equal(parseSlotFilter("x"), null);
  assert.equal(parseSlotFilter(undefined), null);
  assert.equal(entrySlot(null), "standard");
  assert.equal(entrySlot("early"), "early");
});

test("late admin state: awaiting with remaining time, overdue after deadline", () => {
  assert.deepEqual(lateAdminState(base, now), { kind: "awaiting", secondsLeft: 1800 });
  assert.deepEqual(lateAdminState(base, at("2026-12-05T12:31:05Z")), {
    kind: "overdue",
    secondsOver: 65,
  });
  assert.deepEqual(lateAdminState(base, at("2026-12-05T12:30:00Z")), {
    kind: "overdue",
    secondsOver: 0,
  });
});

test("late admin state: draft, paid, cancelled vs auto-cancelled", () => {
  assert.deepEqual(lateAdminState({ ...base, submittedAt: null, payUntil: null }, now), {
    kind: "draft",
  });
  for (const status of [ENTRY_STATUS.paid, ENTRY_STATUS.overpaid, ENTRY_STATUS.confirmed]) {
    assert.deepEqual(lateAdminState({ ...base, status }, now), { kind: "paid" });
  }
  assert.deepEqual(lateAdminState({ ...base, status: ENTRY_STATUS.cancelled }, now), {
    kind: "cancelled",
  });
  assert.deepEqual(
    lateAdminState(
      { ...base, status: ENTRY_STATUS.cancelled, autoCancelledAt: at("2026-12-05T12:31Z") },
      now,
    ),
    { kind: "autoCancelled" },
  );
});

test("m:ss", () => {
  assert.equal(minutesSeconds(0), "0:00");
  assert.equal(minutesSeconds(2527), "42:07");
  assert.equal(minutesSeconds(7500), "125:00");
  assert.equal(minutesSeconds(-5), "0:00");
});
