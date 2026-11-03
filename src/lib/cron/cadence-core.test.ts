import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CRON_SLACK_MS,
  CRON_SLOW_INTERVAL_MS,
  LATE_FAST_AFTER_MS,
  cronDecision,
  lateFastSince,
  nextBankCheck,
  slowDue,
} from "./cadence-core";

const at = (iso: string) => new Date(iso);

test("slowDue: první běh, po 15 min (s rezervou na rozptyl startu), ne dřív", () => {
  assert.equal(slowDue(at("2026-12-03T12:00:05Z"), null), true);
  assert.equal(slowDue(at("2026-12-03T12:01:05Z"), at("2026-12-03T12:00:05Z")), false);
  assert.equal(slowDue(at("2026-12-03T12:14:05Z"), at("2026-12-03T12:00:05Z")), false);
  // ACA start v :15:01 po běhu v :00:05 (o 4 s dřív než 15 min) → běží.
  assert.equal(slowDue(at("2026-12-03T12:15:01Z"), at("2026-12-03T12:00:05Z")), true);
  assert.ok(CRON_SLACK_MS < 60_000 && CRON_SLOW_INTERVAL_MS === 15 * 60_000);
});

test("slowDue: čas posledního běhu v budoucnosti routu nezablokuje", () => {
  assert.equal(slowDue(at("2026-12-03T12:00:00Z"), at("2026-12-03T13:00:00Z")), true);
});

test("cronDecision: spěch jen u povolené routy a s čekající pozdní přihláškou", () => {
  assert.deepEqual(cronDecision(true, true, false), { run: true, fast: true, slow: false });
  assert.deepEqual(cronDecision(true, false, false), { run: false, fast: false, slow: false });
  assert.deepEqual(cronDecision(false, true, false), { run: false, fast: false, slow: false });
  assert.deepEqual(cronDecision(false, false, true), { run: true, fast: false, slow: true });
});

test("lateFastSince: minutová kontrola pokrývá i pojistku zrušení po lhůtě", () => {
  const now = at("2026-12-03T12:40:00Z");
  assert.equal(lateFastSince(now).toISOString(), "2026-12-03T12:30:00.000Z");
  assert.ok(LATE_FAST_AFTER_MS >= 5 * 60_000);
});

test("next bank check: every minute while a late entry waits, else 15 min after last slow run", () => {
  const now = new Date("2026-12-05T12:07:20Z");
  assert.deepEqual(nextBankCheck(now, new Date("2026-12-05T12:00:04Z"), true), {
    at: new Date("2026-12-05T12:08:00Z"),
    fast: true,
  });
  assert.deepEqual(nextBankCheck(now, new Date("2026-12-05T12:00:04Z"), false), {
    at: new Date("2026-12-05T12:15:00Z"),
    fast: false,
  });
  // Po splatnosti / bez záznamu / záznam v budoucnosti = nejbližší minuta.
  for (const last of [new Date("2026-12-05T11:40:00Z"), null, new Date("2026-12-05T13:00Z")]) {
    assert.deepEqual(nextBankCheck(now, last, false), {
      at: new Date("2026-12-05T12:08:00Z"),
      fast: false,
    });
  }
  assert.deepEqual(
    nextBankCheck(new Date("2026-12-05T12:08:00Z"), null, false).at,
    new Date("2026-12-05T12:09:00Z"),
  );
});
