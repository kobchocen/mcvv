import assert from "node:assert/strict";
import test from "node:test";

import { LIVE_POLL_MAX_MS, LIVE_POLL_MS, nextPollDelay, parseRetryAfter } from "./poll-core";

test("nextPollDelay polls every 5 s and backs off exponentially after failures", () => {
  assert.equal(nextPollDelay(0), LIVE_POLL_MS);
  assert.equal(nextPollDelay(1), 10_000);
  assert.equal(nextPollDelay(2), 20_000);
  assert.equal(nextPollDelay(3), 40_000);
  assert.equal(nextPollDelay(4), LIVE_POLL_MAX_MS);
  assert.equal(nextPollDelay(20), LIVE_POLL_MAX_MS);
});

test("nextPollDelay honours Retry-After and spreads clients by ±10 %", () => {
  assert.equal(nextPollDelay(1, 30), 30_000);
  assert.equal(nextPollDelay(4, 5), LIVE_POLL_MAX_MS);
  assert.equal(nextPollDelay(0, null, 0), 4500);
  assert.equal(nextPollDelay(0, null, 1), 5500);
});

test("parseRetryAfter reads delta seconds only", () => {
  assert.equal(parseRetryAfter("12"), 12);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter("0"), null);
  assert.equal(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT"), null);
});
