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
        reason: "underpaid",
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
  assert.match(mail.text, /nižší částka než k úhradě/);
  assert.match(mail.text, /přeplatek 100 Kč/);
  assert.ok(!mail.html.includes("<x>"));
});
