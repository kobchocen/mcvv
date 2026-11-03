import assert from "node:assert/strict";
import test from "node:test";

import type { Slot } from "./core";
import {
  currentEntrySlot,
  entrySlotType,
  freeEntryAllowed,
  orderMyEntries,
  pickWritableRegistration,
  registrationWritable,
  splitMyEntries,
  type EntryWriteContext,
} from "./entry-slot";

const iso = (s: string) => new Date(s);

const slot = (over: Partial<Slot> & Pick<Slot, "type">): Slot => ({
  from: iso("2026-09-01T00:00:00Z"),
  to: iso("2026-12-02T23:00:00Z"),
  active: true,
  feeAdult: 100,
  feeYouth: 50,
  payWithinMinutes: null,
  ...over,
});

// 2027-like edition: early until 1. 10., then standard until 2. 12. 23:59 (Prague).
const slots: Slot[] = [
  slot({ type: "early", to: iso("2026-10-01T00:00:00Z") }),
  slot({ type: "standard", from: iso("2026-10-01T00:00:00Z") }),
  slot({
    type: "late",
    from: iso("2026-12-02T23:00:00Z"),
    to: iso("2026-12-05T17:00:00Z"),
    payWithinMinutes: 60,
  }),
];

const ctx = (now: string, over: Partial<EntryWriteContext> = {}): EntryWriteContext => ({
  year: 2026,
  open: true,
  slots,
  now: iso(now),
  ...over,
});

test("entrySlotType: entry without a term record is standard", () => {
  assert.equal(entrySlotType(null), "standard");
  assert.equal(entrySlotType(undefined), "standard");
  assert.equal(entrySlotType("late"), "late");
});

test("freeEntryAllowed: only early and standard (Q301)", () => {
  assert.equal(freeEntryAllowed(null), true);
  assert.equal(freeEntryAllowed("early"), true);
  assert.equal(freeEntryAllowed("standard"), true);
  assert.equal(freeEntryAllowed("late"), false);
  assert.equal(freeEntryAllowed("onsite"), false);
});

test("pickWritableRegistration: one entry per e-mail and term", () => {
  const rows = [
    { id: 3, email: "a@x.cz", status: null, slot: "early" as const },
    { id: 5, email: " A@X.cz ", status: null, slot: null },
    { id: 7, email: "a@x.cz", status: null, slot: "standard" as const },
    { id: 2, email: "a@x.cz", status: 0, slot: "standard" as const },
    { id: 1, email: "b@x.cz", status: null, slot: "standard" as const },
  ];
  // standard: id 5 (no record = standard) is the lowest non-cancelled one; cancelled id 2 (stav 0) skipped
  assert.equal(pickWritableRegistration(rows, "a@x.cz", "standard")?.id, 5);
  assert.equal(pickWritableRegistration(rows, "a@x.cz", "early")?.id, 3);
  assert.equal(pickWritableRegistration(rows, "a@x.cz", "late"), null);
  // edition without terms: any non-cancelled entry (previous behaviour)
  assert.equal(pickWritableRegistration(rows, "a@x.cz", null)?.id, 3);
  assert.equal(pickWritableRegistration(rows, "c@x.cz", null), null);
});

test("currentEntrySlot: running writable term, null without terms or when closed", () => {
  assert.equal(currentEntrySlot(ctx("2026-09-15T10:00:00Z")), "early");
  assert.equal(currentEntrySlot(ctx("2026-11-15T10:00:00Z")), "standard");
  assert.equal(currentEntrySlot(ctx("2026-11-15T10:00:00Z", { slots: [] })), null);
  assert.equal(currentEntrySlot(ctx("2026-11-15T10:00:00Z", { open: false })), null);
});

test("registrationWritable: only while the entry's own term runs", () => {
  const early = { year: 2026, status: null, slot: "early" as const };
  const standard = { year: 2026, status: null, slot: null };
  // early running
  assert.equal(registrationWritable(ctx("2026-09-15T10:00:00Z"), early), true);
  assert.equal(registrationWritable(ctx("2026-09-15T10:00:00Z"), standard), false);
  // standard running: the early entry is locked (read only), the standard one writable
  assert.equal(registrationWritable(ctx("2026-11-15T10:00:00Z"), early), false);
  assert.equal(registrationWritable(ctx("2026-11-15T10:00:00Z"), standard), true);
  // closed, cancelled, other year
  assert.equal(registrationWritable(ctx("2026-11-15T10:00:00Z", { open: false }), standard), false);
  assert.equal(
    registrationWritable(ctx("2026-11-15T10:00:00Z"), { ...standard, status: 0 }),
    false,
  );
  assert.equal(
    registrationWritable(ctx("2026-11-15T10:00:00Z"), { ...standard, year: 2025 }),
    false,
  );
  // edition without terms: previous behaviour (open + current year + not cancelled)
  assert.equal(registrationWritable(ctx("2026-11-15T10:00:00Z", { slots: [] }), early), true);
});

test("orderMyEntries: writable first (lowest id), then locked newest first", () => {
  const rows = [
    { id: 2, writable: false },
    { id: 9, writable: true },
    { id: 6, writable: false },
    { id: 4, writable: true },
  ];
  assert.deepEqual(
    orderMyEntries(rows).map((row) => row.id),
    [4, 9, 6, 2],
  );
});

test("splitMyEntries: forms only for a writable entry (Q346)", () => {
  const w = { id: 3, writable: true };
  const a = { id: 2, writable: false };
  const b = { id: 1, writable: false };
  assert.deepEqual(splitMyEntries([w, a, b], true), { primary: w, locked: [a, b] });
  // Otevřeno, ale žádná měnitelná (brzká skončila) → žádná hlavní; další běžec = nová přihláška.
  assert.deepEqual(splitMyEntries([a, b], true), { primary: null, locked: [a, b] });
  // Po uzávěrce nahoře nejnovější, jen ke čtení.
  assert.deepEqual(splitMyEntries([a, b], false), { primary: a, locked: [b] });
  assert.deepEqual(splitMyEntries([], true), { primary: null, locked: [] });
});

test("registrationWritable: late draft is writable until submitted or paid (Q330, Q343)", () => {
  const now = "2026-12-03T12:00:00Z";
  const draft = { year: 2026, status: 2, slot: "late" as const };
  assert.equal(currentEntrySlot(ctx(now)), "late");
  assert.equal(registrationWritable(ctx(now), draft), true);
  assert.equal(
    registrationWritable(ctx(now), { ...draft, submittedAt: iso("2026-12-03T11:50:00Z") }),
    false,
  );
  assert.equal(registrationWritable(ctx(now), { ...draft, status: 3 }), false);
  // standardní přihláška je v pozdním termínu uzavřená
  assert.equal(registrationWritable(ctx(now), { ...draft, slot: "standard" as const }), false);
  // bez startovného zdarma v pozdním termínu
  assert.equal(freeEntryAllowed(currentEntrySlot(ctx(now))), false);
});
