import assert from "node:assert/strict";
import { test } from "node:test";

import { autoConfirmLastDay, type Slot } from "./core";
import {
  cancelReadiness,
  needsStandardPayment,
  pragueAtClock,
  pragueDayLabel,
  pragueUntilDayLabel,
  standardPayPhase,
} from "./standard-pay-core";
import {
  renderAutoCancelMail,
  renderStandardPayMail,
  type StandardPayMailInput,
} from "./standard-pay-render";

const mailAt = new Date("2026-12-03T06:00:00Z"); // čt 7:00 Praha
const payUntil = new Date("2026-12-03T11:00:00Z"); // čt 12:00 Praha

test("phases: before 7:00, mail until 12:00, cancel afterwards", () => {
  assert.equal(standardPayPhase(new Date("2026-12-03T05:59:00Z"), { mailAt, payUntil }), "before");
  assert.equal(standardPayPhase(mailAt, { mailAt, payUntil }), "mail");
  assert.equal(standardPayPhase(new Date("2026-12-03T10:59:59Z"), { mailAt, payUntil }), "mail");
  assert.equal(standardPayPhase(payUntil, { mailAt, payUntil }), "cancel");
});

test("only unpaid paid-fee standard entries need the doplatek", () => {
  const base = { status: 2, email: "a@b.cz", fee: 300, paid: 0, slot: null } as const;
  assert.equal(needsStandardPayment(base), true);
  assert.equal(needsStandardPayment({ ...base, slot: "standard" }), true);
  assert.equal(needsStandardPayment({ ...base, slot: "early" }), true);
  assert.equal(needsStandardPayment({ ...base, slot: "late" }), false);
  assert.equal(needsStandardPayment({ ...base, fee: 0 }), false); // startovné zdarma
  assert.equal(needsStandardPayment({ ...base, paid: 300 }), false);
  assert.equal(needsStandardPayment({ ...base, status: 3 }), false);
  assert.equal(needsStandardPayment({ ...base, status: 0 }), false);
  assert.equal(needsStandardPayment({ ...base, paid: 100 }), true); // částečně zaplaceno
});

test("cancel waits for a payments run started after the deadline, max 60 min", () => {
  const at = (iso: string) => new Date(iso);
  assert.deepEqual(cancelReadiness(at("2026-12-03T10:59:00Z"), payUntil, null), {
    ready: false,
    forced: false,
  });
  assert.deepEqual(
    cancelReadiness(at("2026-12-03T11:05:00Z"), payUntil, at("2026-12-03T10:50:00Z")),
    {
      ready: false,
      forced: false,
    },
  );
  assert.deepEqual(
    cancelReadiness(at("2026-12-03T11:05:00Z"), payUntil, at("2026-12-03T11:02:00Z")),
    {
      ready: true,
      forced: false,
    },
  );
  assert.deepEqual(cancelReadiness(at("2026-12-03T12:00:00Z"), payUntil, null), {
    ready: true,
    forced: true,
  });
});

test("Czech weekday labels match the 2026 calendar", () => {
  assert.equal(pragueDayLabel(payUntil), "ve čtvrtek 3. 12.");
  assert.equal(pragueDayLabel(payUntil, true), "ve čtvrtek 3. 12. 2026");
  assert.equal(pragueDayLabel(new Date("2026-12-02T22:58:00Z")), "ve středu 2. 12.");
  assert.equal(pragueDayLabel(new Date("2026-12-06T08:00:00Z")), "v neděli 6. 12.");
  assert.equal(pragueUntilDayLabel(new Date("2026-12-05T16:59:00Z")), "do soboty 5. 12.");
  assert.equal(pragueAtClock(new Date("2026-12-02T22:59:00Z")), "ve 23:59");
  assert.equal(pragueAtClock(payUntil), "ve 12:00");
  assert.equal(pragueAtClock(new Date("2026-12-06T08:45:00Z")), "v 9:45");
});

const input = (late: boolean): StandardPayMailInput => ({
  year: 2026,
  id: 42,
  lines: [
    { runner: "Jana Nováková", fee: 300 },
    { runner: "Petr Novák", fee: 150 },
  ],
  fee: 450,
  paid: 0,
  site: "https://mcvv.example",
  standardEnd: new Date("2026-12-02T23:00:00Z"),
  payUntil,
  late: late ? { to: new Date("2026-12-05T17:00:00Z"), feeAdult: 400, feeYouth: 200 } : null,
  onsite: {
    raceDate: new Date("2026-12-06T00:00:00Z"),
    from: new Date("2026-12-06T08:00:00Z"),
    to: new Date("2026-12-06T08:45:00Z"),
    feeAdult: 500,
    feeYouth: 250,
  },
});

const forbidden = /pořadatel|organi[sz]er|slot|\bZK\b|spec/i;

test("pay-today mail (state h): subject, deadline, VS, no internal wording", () => {
  for (const late of [false, true]) {
    const mail = renderStandardPayMail(input(late));
    assert.equal(
      mail.subject,
      "MCVV 2026 – přihláška č. 42 není zaplacená: zaplaťte dnes do 12:00",
    );
    assert.match(mail.text, /skončily ve středu 2\. 12\. ve 23:59/);
    assert.match(mail.text, /dnes, ve čtvrtek 3\. 12\. 2026, do 12:00/);
    assert.match(mail.text, /202642/);
    assert.match(mail.text, /450 Kč/);
    assert.equal(/pozdní přihlášk/.test(mail.text), late);
    assert.ok(!forbidden.test(mail.text), mail.text);
    assert.ok(!forbidden.test(mail.html.replace(/<[^>]+>/g, " ")));
  }
});

test("auto-cancel mail offers on-site entry and late entry only when active", () => {
  for (const late of [false, true]) {
    const mail = renderAutoCancelMail(input(late));
    assert.equal(mail.subject, "MCVV 2026 – přihláška č. 42 byla zrušena (nezaplaceno)");
    assert.match(mail.text, /ve čtvrtek 3\. 12\. ve 12:00 automaticky zrušili/);
    assert.match(mail.text, /v neděli 6\. 12\. v závodní kanceláři od 9:00 do 9:45/);
    assert.match(mail.text, /Zrušenou přihlášku už nelze obnovit/);
    assert.equal(/pozdní přihlášku do soboty 5\. 12\. 18:00/.test(mail.text), late);
    assert.ok(!forbidden.test(mail.text), mail.text);
  }
});

test("auto-confirm last day follows the pay deadline or the active late window", () => {
  const late = (active: boolean): Slot => ({
    type: "late",
    from: new Date("2026-12-03T11:00:00Z"),
    to: new Date("2026-12-05T17:00:00Z"),
    active,
    feeAdult: 400,
    feeYouth: 200,
    payWithinMinutes: 60,
  });
  assert.equal(autoConfirmLastDay([], payUntil), null);
  assert.equal(autoConfirmLastDay([late(false)], payUntil), "2026-12-03");
  assert.equal(autoConfirmLastDay([late(true)], payUntil), "2026-12-05");
});
