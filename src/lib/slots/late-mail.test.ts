import assert from "node:assert/strict";
import test from "node:test";

import {
  pragueWeekdayDate,
  renderLateCancelMail,
  renderLatePayMail,
  type LateMailInput,
} from "./late-mail-render";

const base: LateMailInput = {
  year: 2026,
  id: 412,
  lines: [
    { runner: "Petr Dvořák", fee: 200 },
    { runner: "Anna Dvořáková", fee: 100 },
  ],
  fee: 300,
  paid: 0,
  site: "https://www.mcvv.org",
  submittedAt: new Date("2026-12-03T11:32:00Z"), // čt 12:32 Praha
  payUntil: new Date("2026-12-03T12:32:00Z"), // čt 13:32 Praha
  raceDate: new Date("2026-12-06T00:00:00Z"),
};

const FORBIDDEN = [/slot/i, /\bZK\b/, /zdarma/i, /spec/i, /pořadatel/i, /losování/i];

function assertPublicCopy(...texts: string[]) {
  for (const text of texts) {
    for (const word of FORBIDDEN) assert.doesNotMatch(text, word);
  }
}

test("pragueWeekdayDate: race day is Sunday 6. 12. 2026", () => {
  assert.equal(pragueWeekdayDate(new Date("2026-12-06T00:00:00Z")), "neděle 6. 12. 2026");
  assert.equal(pragueWeekdayDate(new Date("2026-12-03T12:32:00Z")), "čtvrtek 3. 12. 2026");
});

test("mail k: pay today by HH:MM, as in the mockup", () => {
  const mail = renderLatePayMail(base);
  assert.equal(mail.subject, "MCVV 2026 – pozdní přihláška č. 412: zaplaťte dnes do 13:32");
  assert.match(mail.html, /Zaplaťte do 60 minut/);
  assert.match(mail.text, /Dobrý den, pozdní přihlášku č\. 412 jsme přijali\./);
  assert.match(mail.text, /Zaplaťte nejpozději dnes, ve čtvrtek 3\. 12\. 2026, do 13:32\./);
  assert.match(mail.text, /K úhradě: 300 Kč/);
  assert.match(mail.text, /Variabilní symbol: 2026412/);
  assert.match(mail.text, /Účet: 2700938285 \/ 2010 \(Fio\)/);
  assert.match(mail.text, /Zpráva pro příjemce: STARTOVNE MCVV PRIHLASKA 412/);
  assert.match(mail.text, /Běžci: Petr Dvořák \(200 Kč\), Anna Dvořáková \(100 Kč\)/);
  assert.match(mail.html, /api\/platba-qr\?rok=2026&amp;id=412&amp;castka=300/);
  assert.match(mail.text, /Zaplacenou přihlášku nelze zrušit a startovné se nevrací\./);
  assert.match(mail.html, /Zaplatit – Moje přihláška/);
  assert.match(mail.html, /neděle 6\. 12\. 2026 · Choceň/);
  assertPublicCopy(mail.subject, mail.html, mail.text);
});

test("mail k: deadline after midnight names the day instead of today", () => {
  const mail = renderLatePayMail({
    ...base,
    submittedAt: new Date("2026-12-03T22:40:00Z"), // čt 23:40
    payUntil: new Date("2026-12-03T23:40:00Z"), // pá 0:40
  });
  assert.equal(mail.subject, "MCVV 2026 – pozdní přihláška č. 412: zaplaťte do pátku 4. 12. 0:40");
  assert.match(mail.text, /Zaplaťte nejpozději v pátek 4\. 12\. 2026 v 0:40\./);
  assert.doesNotMatch(mail.text, /dnes/);
});

test("mail l: cancelled, refund, new late entry and on-site offer", () => {
  const mail = renderLateCancelMail({
    ...base,
    late: { to: new Date("2026-12-05T17:00:00Z") },
    onsite: {
      from: new Date("2026-12-06T08:00:00Z"),
      to: new Date("2026-12-06T08:45:00Z"),
      feeAdult: 200,
      feeYouth: 100,
    },
  });
  assert.equal(mail.subject, "MCVV 2026 – pozdní přihláška č. 412 zrušena: platba nedorazila včas");
  assert.match(mail.html, /Přihláška byla zrušena/);
  assert.match(
    mail.text,
    /lhůta na zaplacení pozdní přihlášky č\. 412 vypršela ve čtvrtek 3\. 12\. ve 13:32\. Do té doby jsme na účtu platbu s VS 2026412 nenašli/,
  );
  assert.match(mail.text, /vrátíme na účet, ze kterého přišla\. Přihláška zůstává zrušená\./);
  assert.match(mail.text, /novou pozdní přihlášku \(do soboty 5\. 12\. 18:00\)/);
  assert.match(
    mail.text,
    /Nebo se přihlaste na místě v neděli 6\. 12\. v závodní kanceláři \(9:00–9:45\), 200 Kč dospělí \/ 100 Kč mládež\./,
  );
  assert.match(mail.html, />Moje přihláška</);
  assertPublicCopy(mail.subject, mail.html, mail.text);
});

test("mail l: without running late entries only the on-site offer stays", () => {
  const mail = renderLateCancelMail({
    ...base,
    late: null,
    onsite: {
      from: new Date("2026-12-06T08:00:00Z"),
      to: new Date("2026-12-06T08:45:00Z"),
      feeAdult: 200,
      feeYouth: 100,
    },
  });
  assert.doesNotMatch(mail.text, /novou pozdní přihlášku/);
  assert.match(mail.text, /Přihlásit se můžete ještě na místě v neděli 6\. 12\./);
});
