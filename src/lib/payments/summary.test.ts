import assert from "node:assert/strict";
import { test } from "node:test";

import { pragueClock, renderDailySummary, summaryDue } from "./summary";

test("pragueClock converts to Europe/Prague", () => {
  assert.deepEqual(pragueClock(new Date("2026-10-18T22:30:00Z")), { day: "2026-10-19", hour: 0 });
  assert.deepEqual(pragueClock(new Date("2026-12-03T06:10:00Z")), { day: "2026-12-03", hour: 7 });
});

test("summary only when there is something to report, from 7:00 Prague", () => {
  assert.equal(summaryDue(new Date("2026-10-18T05:00:00Z"), 0), false);
  assert.equal(summaryDue(new Date("2026-10-18T04:00:00Z"), 3), false);
  assert.equal(summaryDue(new Date("2026-10-18T05:00:00Z"), 3), true);
});

test("renderDailySummary lists unmatched payments and overpayments", () => {
  const mail = renderDailySummary({
    rows: [
      {
        date: "2026-10-13",
        amount: 400,
        vs: "202632",
        counterName: "A",
        reason: "not_found",
        registrationId: 32,
        overpaid: 0,
        status: "unmatched",
      },
      {
        date: "2026-10-14",
        amount: 600,
        vs: "202633",
        counterName: "B <x>",
        reason: null,
        registrationId: 33,
        overpaid: 100,
        status: "matched",
      },
    ],
    openUnmatched: 2,
    adminUrl: "https://www.mcvv.org/cs/admin/platby",
  });
  assert.match(mail.subject, /1 nespárovaných, 1 přeplatků/);
  assert.match(mail.text, /přihláška neexistuje/);
  assert.match(mail.text, /přeplatek 100 Kč/);
  assert.ok(!mail.html.includes("<x>"));
  assert.match(mail.text, /Platby po 3\. 12\. \(potvrdit ručně\): 0/);
});

test("late payments appear in the summary", () => {
  const mail = renderDailySummary({
    rows: [
      {
        date: "2026-12-05",
        amount: 300,
        vs: "202640",
        counterName: "C",
        reason: "late",
        registrationId: 40,
        overpaid: 0,
        status: "matched",
      },
    ],
    openUnmatched: 0,
    adminUrl: "https://www.mcvv.org/cs/admin/platby",
  });
  assert.match(mail.subject, /1 po 3\. 12\./);
  assert.match(mail.text, /přihláška 40/);
});
