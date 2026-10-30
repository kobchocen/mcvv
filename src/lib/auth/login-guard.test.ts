import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createLoginGuard,
  DEFAULT_LOGIN_EMAIL_LIMIT,
  DEFAULT_LOGIN_IP_LIMIT,
  LOGIN_WINDOW_MS,
  loginRateLimit,
} from "./login-guard";

const t0 = 1_000_000;

test("defaults: 10 attempts per IP and 5 per e-mail in 15 minutes", () => {
  assert.equal(DEFAULT_LOGIN_IP_LIMIT, 10);
  assert.equal(DEFAULT_LOGIN_EMAIL_LIMIT, 5);
  assert.equal(LOGIN_WINDOW_MS, 15 * 60 * 1000);
});

test("e-mail limit: 5 failed attempts pass, the 6th is limited, a new window starts over", () => {
  const guard = createLoginGuard({ ipLimit: 10, emailLimit: 5 });
  // different IPs so that only the e-mail counter matters
  for (let i = 0; i < 5; i += 1) assert.equal(guard.attempt(`10.0.0.${i}`, "a@b.cz", t0 + i), true);
  assert.equal(guard.attempt("10.0.0.99", "a@b.cz", t0 + 10), false);
  assert.equal(guard.attempt("10.0.0.99", "other@b.cz", t0 + 10), true);
  assert.equal(guard.attempt("10.0.0.99", "a@b.cz", t0 + LOGIN_WINDOW_MS), true);
});

test("IP limit: 10 attempts from one IP across e-mails, the 11th is limited", () => {
  const guard = createLoginGuard({ ipLimit: 10, emailLimit: 5 });
  for (let i = 0; i < 10; i += 1)
    assert.equal(guard.attempt("1.2.3.4", `u${i}@b.cz`, t0 + i), true);
  assert.equal(guard.attempt("1.2.3.4", "fresh@b.cz", t0 + 20), false);
  assert.equal(guard.attempt("5.6.7.8", "fresh@b.cz", t0 + 20), true);
});

test("successful login clears the e-mail counter", () => {
  const guard = createLoginGuard({ ipLimit: 100, emailLimit: 5 });
  for (let i = 0; i < 4; i += 1) assert.equal(guard.attempt("1.2.3.4", "a@b.cz", t0 + i), true);
  guard.succeeded("a@b.cz");
  for (let i = 0; i < 5; i += 1)
    assert.equal(guard.attempt("1.2.3.4", "a@b.cz", t0 + 10 + i), true);
  assert.equal(guard.attempt("1.2.3.4", "a@b.cz", t0 + 20), false);
});

test("no client IP: only the e-mail limit applies; limit 0 is off", () => {
  const guard = createLoginGuard({ ipLimit: 1, emailLimit: 2 });
  assert.equal(guard.attempt(null, "x@b.cz", t0), true);
  assert.equal(guard.attempt(null, "y@b.cz", t0), true);
  assert.equal(guard.attempt(null, "x@b.cz", t0), true);
  assert.equal(guard.attempt(null, "x@b.cz", t0), false);
  const off = createLoginGuard({ ipLimit: 0, emailLimit: 0 });
  for (let i = 0; i < 50; i += 1) assert.equal(off.attempt("1.2.3.4", "a@b.cz", t0), true);
});

test("LOGIN_RATE_LIMIT_* parsing", () => {
  assert.equal(loginRateLimit(undefined, 10), 10);
  assert.equal(loginRateLimit("", 10), 10);
  assert.equal(loginRateLimit("0", 10), 0);
  assert.equal(loginRateLimit("25", 10), 25);
  assert.equal(loginRateLimit("-1", 10), 10);
  assert.equal(loginRateLimit("abc", 5), 5);
});
