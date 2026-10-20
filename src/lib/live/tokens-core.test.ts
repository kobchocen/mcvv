import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateToken,
  hashToken,
  normalizeAuthor,
  normalizeTokenSplits,
  parseBearer,
  TOKEN_PREFIX,
  tokenAllowsSplit,
  tokenState,
} from "./tokens-core";

test("generated tokens are random, prefixed and hashed", () => {
  const a = generateToken();
  const b = generateToken();
  assert.notEqual(a.token, b.token);
  assert.ok(a.token.startsWith(TOKEN_PREFIX));
  assert.equal(a.hash, hashToken(a.token));
  assert.equal(a.hash.length, 64);
  assert.ok(a.token.startsWith(a.prefix));
  assert.ok(a.prefix.length < 20);
});

test("bearer parsing", () => {
  const { token } = generateToken();
  assert.equal(parseBearer(`Bearer ${token}`), token);
  assert.equal(parseBearer(`Basic ${token}`), null);
  assert.equal(parseBearer("Bearer short"), null);
  assert.equal(parseBearer(null), null);
});

test("token window", () => {
  const w = {
    validFrom: new Date("2026-12-06T05:00:00Z"),
    validUntil: new Date("2026-12-06T17:00:00Z"),
    revokedAt: null,
  };
  assert.equal(tokenState(w, new Date("2026-12-06T10:00:00Z")), "active");
  assert.equal(tokenState(w, new Date("2026-12-06T04:00:00Z")), "not-yet-valid");
  assert.equal(tokenState(w, new Date("2026-12-06T18:00:00Z")), "expired");
  assert.equal(
    tokenState({ ...w, revokedAt: new Date() }, new Date("2026-12-06T10:00:00Z")),
    "revoked",
  );
});

test("splits and author normalization", () => {
  assert.ok(tokenAllowsSplit("9", "9"));
  assert.ok(!tokenAllowsSplit("9", "1"));
  assert.ok(!tokenAllowsSplit("19", ""));
  assert.equal(normalizeTokenSplits("9, 1 ,3,3"), "139");
  assert.equal(normalizeTokenSplits("abc"), null);
  assert.equal(normalizeAuthor(" LuM "), "LuM");
  assert.equal(normalizeAuthor("toolongauthor"), null);
  assert.equal(normalizeAuthor("a b"), null);
});
