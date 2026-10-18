import assert from "node:assert/strict";
import { test } from "node:test";

import { renderReminder } from "./render";
import { dueReminder, isReminder2Window, type ReminderCandidate } from "./schedule";

const Y = 2026;
const deadlineEnd = new Date("2026-12-02T22:59:59Z");
const base: ReminderCandidate = {
  status: 2,
  email: "a@example.test",
  fee: 500,
  paid: 0,
  lastModified: new Date("2026-10-17T08:00:00Z"),
  reminder1At: null,
  reminder2At: null,
};
const at = (iso: string) => ({ now: new Date(iso), year: Y, deadlineEnd });

test("R1 goes 24 h after the last change, in the 8–20 h window, once", () => {
  assert.equal(dueReminder(base, at("2026-10-18T07:00:00Z")), null); // 23 h
  assert.equal(dueReminder(base, at("2026-10-18T08:00:00Z")), 1);
  assert.equal(dueReminder(base, at("2026-10-18T19:30:00Z")), null); // 21:30 Praha
  assert.equal(dueReminder({ ...base, reminder1At: new Date() }, at("2026-10-18T09:00:00Z")), null);
});

test("no reminders for paid, confirmed, cancelled or email-less entries", () => {
  const now = at("2026-10-20T09:00:00Z");
  for (const status of [0, 1, 3, 4, 5]) assert.equal(dueReminder({ ...base, status }, now), null);
  assert.equal(dueReminder({ ...base, paid: 500 }, now), null);
  assert.equal(dueReminder({ ...base, email: null }, now), null);
});

test("R1 is not sent after the deadline", () => {
  assert.equal(dueReminder(base, at("2026-12-03T08:00:00Z")), 2);
  assert.equal(dueReminder({ ...base, reminder2At: new Date() }, at("2026-12-03T08:00:00Z")), null);
  assert.equal(dueReminder(base, at("2026-12-04T09:00:00Z")), null);
});

test("R2 only on 3 December in the morning (Prague), once, even after R1", () => {
  assert.equal(isReminder2Window(new Date("2026-12-03T05:59:00Z"), Y), false); // 6:59
  assert.equal(isReminder2Window(new Date("2026-12-03T06:00:00Z"), Y), true); // 7:00
  assert.equal(isReminder2Window(new Date("2026-12-03T11:00:00Z"), Y), false); // 12:00
  assert.equal(dueReminder({ ...base, reminder1At: new Date() }, at("2026-12-03T07:00:00Z")), 2);
});

test("reminder emails show the remaining amount, payment details, QR and the signature", () => {
  for (const kind of [1, 2] as const) {
    const mail = renderReminder({
      kind,
      year: Y,
      id: 32,
      name: "Klub <A>",
      lines: [
        { runner: "Jan Novák", club: "KOB", category: "H", fee: 300 },
        { runner: "Eva Nová", club: "KOB", category: "D", fee: 200 },
      ],
      fee: 500,
      paid: 200,
      site: "https://www.mcvv.org",
      deadline: "2026-12-02",
    });
    assert.match(mail.text, /Zbývá zaplatit: 300 Kč/);
    assert.match(mail.text, /K úhradě: 300 Kč/);
    assert.match(mail.text, /Variabilní symbol: 202632/);
    assert.match(mail.text, /2700938285\/2010/);
    assert.match(mail.text, /Intervalový start od 10:15/);
    assert.match(mail.text, /Tým pořadatelů z K\.O\.B\. Choceň/);
    assert.match(mail.html, /api\/platba-qr\?rok=2026&amp;id=32&amp;castka=300/);
    assert.ok(!/návod/i.test(mail.text + mail.html));
    assert.ok(!mail.html.includes("<A>"));
  }
});
