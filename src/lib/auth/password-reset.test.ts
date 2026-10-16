import assert from "node:assert/strict";
import { test } from "node:test";

import { RateLimiter, checkNewPassword, isResetTokenUsable } from "./password-reset";
import { hashToken, isTokenShape, newToken } from "./tokens";

test("newToken stores only a sha256 hash of a 64-hex token", () => {
  const { token, tokenHash } = newToken();
  assert.ok(isTokenShape(token));
  assert.equal(tokenHash, hashToken(token));
  assert.notEqual(tokenHash, token);
  assert.equal(tokenHash.length, 64);
  assert.notEqual(newToken().token, token);
});

test("isTokenShape rejects garbage", () => {
  assert.equal(isTokenShape("abc"), false);
  assert.equal(isTokenShape("z".repeat(64)), false);
  assert.equal(isTokenShape(undefined), false);
});

test("reset token usable only for reset purpose and before expiry", () => {
  const now = Date.now();
  assert.equal(
    isResetTokenUsable({ purpose: "reset", expiresAt: new Date(now + 1000) }, now),
    true,
  );
  assert.equal(isResetTokenUsable({ purpose: "reset", expiresAt: new Date(now - 1) }, now), false);
  assert.equal(
    isResetTokenUsable({ purpose: "verify", expiresAt: new Date(now + 1000) }, now),
    false,
  );
  assert.equal(isResetTokenUsable(null, now), false);
});

test("checkNewPassword mirrors registration rules", () => {
  assert.equal(checkNewPassword("short", "short"), "short");
  assert.equal(checkNewPassword("longenough", "different1"), "mismatch");
  assert.equal(checkNewPassword("longenough", "longenough"), null);
});

test("RateLimiter blocks after limit and resets after window", () => {
  const limiter = new RateLimiter(2, 1000);
  assert.equal(limiter.take("a", 0), true);
  assert.equal(limiter.take("a", 10), true);
  assert.equal(limiter.take("a", 20), false);
  assert.equal(limiter.take("b", 20), true);
  assert.equal(limiter.take("a", 1001), true);
});
