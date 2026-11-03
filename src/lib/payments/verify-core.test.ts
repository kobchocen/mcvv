import assert from "node:assert/strict";
import { test } from "node:test";

import { FIO_MIN_INTERVAL_MS } from "./fio";
import {
  VERIFY_MIN_INTERVAL_MS,
  stateDate,
  verifyStateName,
  verifyWaitSeconds,
} from "./verify-core";

const now = new Date("2026-12-03T12:00:00Z");
const ago = (s: number) => new Date(now.getTime() - s * 1000);

test("verifyWaitSeconds: bez předchozích dotazů lze ověřit hned", () => {
  assert.equal(verifyWaitSeconds(now, null, null), 0);
});

test("verifyWaitSeconds: tlačítko max. 1× za 30 s na přihlášku", () => {
  assert.equal(VERIFY_MIN_INTERVAL_MS, 30_000);
  assert.equal(verifyWaitSeconds(now, ago(10), null), 20);
  assert.equal(verifyWaitSeconds(now, ago(30), null), 0);
});

test("verifyWaitSeconds: respektuje limit Fio API sdílený s cronem (31 s)", () => {
  assert.ok(FIO_MIN_INTERVAL_MS >= 30_000);
  assert.equal(verifyWaitSeconds(now, null, ago(1)), 30);
  assert.equal(verifyWaitSeconds(now, ago(5), ago(20)), 25);
  assert.equal(verifyWaitSeconds(now, null, ago(31)), 0);
});

test("verifyWaitSeconds: čas v budoucnosti (posun hodin) neblokuje", () => {
  assert.equal(verifyWaitSeconds(now, new Date(now.getTime() + 60_000), null), 0);
});

test("verifyStateName a stateDate", () => {
  assert.equal(verifyStateName(2026, 913), "verify_pay_2026_913");
  assert.equal(stateDate("2026-12-03T12:00:00.000Z")?.toISOString(), "2026-12-03T12:00:00.000Z");
  assert.equal(stateDate("nesmysl"), null);
  assert.equal(stateDate(null), null);
});
