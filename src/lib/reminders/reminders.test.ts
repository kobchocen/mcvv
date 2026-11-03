import assert from "node:assert/strict";
import { test } from "node:test";

import { renderReminder } from "./render";
import { dueReminder, type ReminderCandidate } from "./schedule";

const Y = 2026;
const standardEnd = new Date("2026-12-02T23:00:00Z");
const base: ReminderCandidate = {
  status: 2,
  email: "a@example.test",
  fee: 500,
  paid: 0,
  lastModified: new Date("2026-10-17T08:00:00Z"),
  reminder1At: null,
};
const at = (iso: string) => ({ now: new Date(iso), standardEnd });

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

test("R1 is not sent after standard entries end, and R2 no longer exists", () => {
  assert.equal(dueReminder(base, at("2026-12-02T18:00:00Z")), 1); // st 19:00 Praha
  assert.equal(dueReminder(base, at("2026-12-03T08:00:00Z")), null);
  assert.equal(dueReminder(base, at("2026-12-04T09:00:00Z")), null);
  assert.equal(dueReminder({ ...base, reminder1At: new Date() }, at("2026-12-03T07:00:00Z")), null);
});

test("reminder emails show the remaining amount, payment details, QR and the signature", () => {
  {
    const mail = renderReminder({
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

test("reminder start time follows the edition zero", () => {
  const mail = renderReminder({
    year: Y,
    id: 32,
    name: null,
    lines: [{ runner: "Jan Novák", club: "KOB", category: "H", fee: 300 }],
    fee: 300,
    paid: 0,
    site: "https://www.mcvv.org",
    startZeroSeconds: 9 * 3600 + 30 * 60,
  });
  assert.match(mail.text, /Intervalový start od 9:30/);
  assert.ok(!(mail.text + mail.html).includes("10:15"));
});
