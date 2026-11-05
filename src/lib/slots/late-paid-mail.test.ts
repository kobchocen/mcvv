import assert from "node:assert/strict";
import test from "node:test";

import { atClock, renderLatePaidMail, type LatePaidMailInput } from "./late-mail-render";

const base: LatePaidMailInput = {
  year: 2026,
  id: 412,
  lines: [
    { runner: "Petr Dvořák", category: "Muži", fee: 200, bib: 287, start: "10:58:30" },
    { runner: "Anna Dvořáková", category: "Dorostenky", fee: 100, bib: 164, start: "10:31:00" },
  ],
  fee: 300,
  paid: 300,
  site: "https://mcvv.example.test",
  // Neděle 6. 12. 2026, kancelář od 9:00 (Praha, UTC+1).
  raceDate: new Date("2026-12-06T00:00:00+01:00"),
  published: true,
  officeOpens: new Date("2026-12-06T09:00:00+01:00"),
  firstStart: "10:15",
};

const FORBIDDEN = /pořadatel|spec|slot|\bZK\b|zdarma|los(em|ování čísel)/i;

test("mail g: subject, bibs, start times, Sunday pickup, no forbidden words", () => {
  const mail = renderLatePaidMail(base);
  assert.equal(mail.subject, "MCVV 2026 – platba přijata, přihláška č. 412 potvrzena");
  for (const body of [mail.text, mail.html]) {
    assert.match(body, /č\. 287/);
    assert.match(body, /10:58:30/);
    assert.match(body, /č\. 164/);
    assert.match(body, /v neděli 6\. 12\. od 9:00/);
    assert.match(body, /Start prvního běžce v 10:15/);
    assert.match(body, /VS 2026412/);
    assert.doesNotMatch(body, FORBIDDEN);
    assert.doesNotMatch(body, /přidělíme|ve zveřejněné startovce/);
  }
});

test("mail g: not published → pending bib sentence, no numbers", () => {
  const mail = renderLatePaidMail({ ...base, published: false });
  assert.match(
    mail.text,
    /Startovní číslo a čas startu najdete v Moje přihláška a ve zveřejněné startovce\./,
  );
  assert.doesNotMatch(mail.text, /přidělíme/);
  assert.doesNotMatch(mail.text, /č\. 287/);
  assert.doesNotMatch(mail.html, FORBIDDEN);
});

test("mail g: published but a runner without bib → points to Moje přihláška", () => {
  const lines = [base.lines[0], { ...base.lines[1], bib: null, start: null }];
  const mail = renderLatePaidMail({ ...base, lines });
  assert.match(mail.text, /č\. 287/);
  assert.match(mail.text, /Číslo a čas startu najdete v Moje přihláška/);
});

test("atClock preposition", () => {
  assert.equal(atClock("10:15"), "v 10:15");
  assert.equal(atClock("12:00"), "ve 12:00");
});
