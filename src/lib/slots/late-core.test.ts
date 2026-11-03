import assert from "node:assert/strict";
import test from "node:test";

import {
  isPaidStatus,
  LATE_CANCEL_GRACE_MS,
  lateCancelReadiness,
  lateEntryState,
  lateNeedsCancel,
  latePayUntil,
  pickLateTarget,
  secondsLeft,
} from "./late-core";

const at = (iso: string) => new Date(iso);
const SENT = at("2026-12-03T12:32:00Z");

test("lateEntryState: draft → awaiting → paid; cancelled wins", () => {
  assert.equal(lateEntryState({ status: 2, submittedAt: null }), "draft");
  assert.equal(lateEntryState({ status: 1, submittedAt: null }), "draft");
  assert.equal(lateEntryState({ status: 2, submittedAt: SENT }), "awaiting");
  assert.equal(lateEntryState({ status: 3, submittedAt: SENT }), "paid");
  assert.equal(lateEntryState({ status: 4, submittedAt: SENT }), "paid");
  assert.equal(lateEntryState({ status: 5, submittedAt: SENT }), "paid");
  assert.equal(lateEntryState({ status: 0, submittedAt: SENT }), "cancelled");
  assert.equal(isPaidStatus(2), false);
});

test("latePayUntil: submission + 60 min", () => {
  assert.equal(latePayUntil(SENT).toISOString(), "2026-12-03T13:32:00.000Z");
  assert.equal(latePayUntil(SENT, 90).toISOString(), "2026-12-03T14:02:00.000Z");
});

const row = (id: number, over: Partial<Parameters<typeof pickLateTarget>[0][number]> = {}) => ({
  id,
  email: "jana@example.cz",
  status: 2,
  slot: "late" as const,
  submittedAt: null as Date | null,
  ...over,
});

test("pickLateTarget: adds to the draft, skips paid late (Q343) and other terms", () => {
  const rows = [
    row(318, { slot: "standard" as never, status: 3 }),
    row(401, { status: 3, submittedAt: SENT }),
    row(405, { status: 0, submittedAt: SENT }),
    row(412),
  ];
  const picked = pickLateTarget(rows, " Jana@Example.cz ");
  assert.equal(picked.target?.id, 412);
  assert.equal(picked.blocking, null);
});

test("pickLateTarget: no draft → new entry; paid late is never reused", () => {
  const picked = pickLateTarget([row(401, { status: 3, submittedAt: SENT })], "jana@example.cz");
  assert.equal(picked.target, null);
  assert.equal(picked.blocking, null);
});

test("pickLateTarget: a submitted unpaid late entry blocks a new one (Q344)", () => {
  const picked = pickLateTarget([row(412, { submittedAt: SENT })], "jana@example.cz");
  assert.equal(picked.blocking?.id, 412);
  assert.equal(picked.target, null);
  // Cizí e-mail neblokuje.
  assert.equal(pickLateTarget([row(412, { submittedAt: SENT })], "petr@example.cz").blocking, null);
});

test("lateCancelReadiness: waits for a payments run after the deadline, then +5 min", () => {
  const until = latePayUntil(SENT);
  const before = new Date(until.getTime() - 1000);
  assert.deepEqual(lateCancelReadiness(before, until, null), { ready: false, forced: false });
  const after = new Date(until.getTime() + 60_000);
  assert.deepEqual(lateCancelReadiness(after, until, SENT), { ready: false, forced: false });
  assert.deepEqual(lateCancelReadiness(after, until, new Date(until.getTime() + 1000)), {
    ready: true,
    forced: false,
  });
  const late = new Date(until.getTime() + LATE_CANCEL_GRACE_MS);
  assert.deepEqual(lateCancelReadiness(late, until, null), { ready: true, forced: true });
});

test("lateNeedsCancel: only submitted, unpaid in full, with a fee", () => {
  const base = {
    status: 2,
    slot: "late" as const,
    submittedAt: SENT,
    payUntil: latePayUntil(SENT),
    fee: 300,
    paid: 0,
  };
  assert.equal(lateNeedsCancel(base), true);
  assert.equal(lateNeedsCancel({ ...base, paid: 200 }), true);
  assert.equal(lateNeedsCancel({ ...base, paid: 300, status: 3 }), false);
  assert.equal(lateNeedsCancel({ ...base, submittedAt: null }), false);
  assert.equal(lateNeedsCancel({ ...base, slot: "standard" as never }), false);
  assert.equal(lateNeedsCancel({ ...base, status: 0 }), false);
  assert.equal(lateNeedsCancel({ ...base, fee: 0 }), false);
});

test("secondsLeft", () => {
  const until = latePayUntil(SENT);
  assert.equal(secondsLeft(new Date(until.getTime() - 2832_000), until), 2832);
  assert.equal(secondsLeft(new Date(until.getTime() + 5000), until), 0);
});
