import assert from "node:assert/strict";
import test from "node:test";

import {
  activeSlot,
  deadlineFromStandardEnd,
  parsePragueLocalInput,
  pragueLocalInput,
  registrationOpen,
  slotFee,
  standardEnd,
  standardEndFromDeadline,
  standardPayMailAt,
  standardPayUntil,
  validateSlots,
  type Slot,
} from "./core";
import { defaultSlots, slotsWithDefaults } from "./defaults";

const iso = (s: string) => new Date(s);
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

const slot = (over: Partial<Slot> & Pick<Slot, "type">): Slot => ({
  from: iso("2026-09-01T00:00:00Z"),
  to: iso("2026-12-02T23:00:00Z"),
  active: true,
  feeAdult: 100,
  feeYouth: 50,
  payWithinMinutes: null,
  ...over,
});

const slots2026: Slot[] = [
  slot({ type: "early", to: iso("2026-09-01T00:00:00Z"), active: false }),
  slot({ type: "standard" }),
  slot({
    type: "late",
    from: iso("2026-12-02T23:00:00Z"),
    to: iso("2026-12-05T17:00:00Z"),
    active: false,
    feeAdult: 200,
    feeYouth: 100,
    payWithinMinutes: 60,
  }),
  slot({
    type: "onsite",
    from: iso("2026-12-06T08:00:00Z"),
    to: iso("2026-12-06T08:45:00Z"),
    feeAdult: 200,
    feeYouth: 100,
  }),
];

test("standard end from the deadline is the next Prague midnight (Wed 2. 12. → 23:00 UTC)", () => {
  assert.deepEqual(standardEndFromDeadline(day("2026-12-02")), iso("2026-12-02T23:00:00Z"));
  // letní čas
  assert.deepEqual(standardEndFromDeadline(day("2026-06-10")), iso("2026-06-10T22:00:00Z"));
  assert.deepEqual(deadlineFromStandardEnd(iso("2026-12-02T23:00:00Z")), day("2026-12-02"));
  assert.deepEqual(deadlineFromStandardEnd(iso("2026-12-02T22:59:00Z")), day("2026-12-02"));
});

test("registration is open only inside an active early/standard slot", () => {
  assert.equal(registrationOpen(slots2026, null, iso("2026-11-30T10:00:00Z")), true);
  assert.equal(registrationOpen(slots2026, null, iso("2026-12-02T22:59:59Z")), true);
  // Čt 3. 12. 0:00 Praha – standard skončil, late je vypnutý
  assert.equal(registrationOpen(slots2026, null, iso("2026-12-02T23:00:00Z")), false);
  assert.equal(registrationOpen(slots2026, null, iso("2026-08-31T21:59:00Z")), false);
  // late se v části 1 nepočítá, ani když je zapnutý
  const lateOn = slots2026.map((s) => (s.type === "late" ? { ...s, active: true } : s));
  assert.equal(registrationOpen(lateOn, null, iso("2026-12-03T10:00:00Z")), false);
  assert.equal(activeSlot(slots2026, iso("2026-11-01T10:00:00Z"))?.type, "standard");
});

test("without slots the legacy deadline rule applies", () => {
  assert.equal(registrationOpen([], null, iso("2030-01-01T00:00:00Z")), true);
  assert.equal(registrationOpen([], day("2026-12-02"), iso("2026-12-02T22:59:59Z")), true);
  assert.equal(registrationOpen([], day("2026-12-02"), iso("2026-12-02T23:00:00Z")), false);
  assert.deepEqual(standardEnd([], day("2026-12-02")), iso("2026-12-02T23:00:00Z"));
  assert.equal(standardEnd([], null), null);
});

test("standard pay deadline defaults to Thu 3. 12. 12:00 Prague, mail at 7:00", () => {
  const until = standardPayUntil(slots2026, { regDeadline: null, standardPayUntil: null });
  assert.deepEqual(until, iso("2026-12-03T11:00:00Z"));
  assert.deepEqual(standardPayMailAt(until!, 7 * 3600), iso("2026-12-03T06:00:00Z"));
  const set = iso("2026-12-03T13:00:00Z");
  assert.equal(standardPayUntil(slots2026, { regDeadline: null, standardPayUntil: set }), set);
  assert.deepEqual(
    standardPayUntil([], { regDeadline: day("2026-12-02"), standardPayUntil: null }),
    iso("2026-12-03T11:00:00Z"),
  );
});

test("slot fee by group, falling back to the category fee", () => {
  const standard = slots2026[1]!;
  assert.equal(slotFee(standard, "dospeli", 80), 100);
  assert.equal(slotFee(standard, "mladez", 80), 50);
  assert.equal(slotFee(standard, null, 80), 80);
  assert.equal(slotFee(null, "mladez", 80), 80);
});

test("validation catches order, overlap, pay deadline and on-site times", () => {
  const base = {
    payUntil: iso("2026-12-03T11:00:00Z"),
    officeOpensS: 32_400,
    onsiteUntilS: 35_100,
  };
  assert.deepEqual(validateSlots(slots2026, base), []);
  const broken = slots2026.map((s) =>
    s.type === "late" ? { ...s, active: true, from: iso("2026-12-01T00:00:00Z") } : s,
  );
  assert.deepEqual(validateSlots(broken, base), ["overlap"]);
  const reversed = slots2026.map((s) =>
    s.type === "standard" ? { ...s, to: iso("2026-08-01T00:00:00Z") } : s,
  );
  assert.ok(validateSlots(reversed, base).includes("order"));
  assert.deepEqual(validateSlots(slots2026, { ...base, payUntil: iso("2026-12-02T12:00:00Z") }), [
    "pay_until",
  ]);
  assert.deepEqual(validateSlots(slots2026, { ...base, onsiteUntilS: 30_000 }), ["onsite"]);
  assert.deepEqual(
    validateSlots(
      slots2026.filter((s) => s.type !== "standard"),
      base,
    ),
    ["standard_missing"],
  );
  assert.deepEqual(
    validateSlots(
      slots2026.map((s) => (s.type === "onsite" ? { ...s, feeAdult: -1 } : s)),
      base,
    ),
    ["fee"],
  );
});

test("datetime-local values are Prague civil time", () => {
  assert.equal(pragueLocalInput(iso("2026-12-02T23:00:00Z")), "2026-12-03T00:00");
  assert.equal(pragueLocalInput(null), "");
  assert.deepEqual(parsePragueLocalInput("2026-12-03T12:00"), iso("2026-12-03T11:00:00Z"));
  assert.deepEqual(parsePragueLocalInput("2026-07-01T12:00"), iso("2026-07-01T10:00:00Z"));
  assert.equal(parsePragueLocalInput("2026-13-01T12:00"), null);
  assert.equal(parsePragueLocalInput(""), null);
});

test("default slots match the migration seed", () => {
  const edition = {
    date: day("2026-12-06"),
    regDeadline: day("2026-12-02"),
    regOpensAt: null,
    startAdultMail: 100,
    startKidsMail: 50,
    startAdultPlace: 200,
    startKidsPlace: 100,
  };
  const slots = defaultSlots(edition);
  assert.deepEqual(
    slots.map((s) => [s.type, s.from.toISOString(), s.to.toISOString(), s.active, s.feeAdult]),
    [
      ["early", "2026-08-31T22:00:00.000Z", "2026-08-31T22:00:00.000Z", false, 100],
      ["standard", "2026-08-31T22:00:00.000Z", "2026-12-02T23:00:00.000Z", true, 100],
      ["late", "2026-12-02T23:00:00.000Z", "2026-12-05T17:00:00.000Z", false, 200],
      ["onsite", "2026-12-06T08:00:00.000Z", "2026-12-06T08:45:00.000Z", true, 200],
    ],
  );
  const stored = [slot({ type: "standard", feeAdult: 120 })];
  assert.equal(slotsWithDefaults(stored, edition)[1]!.feeAdult, 120);
  assert.equal(slotsWithDefaults(stored, edition).length, 4);
});
