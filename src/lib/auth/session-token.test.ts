import assert from "node:assert/strict";
import { test } from "node:test";

import { decodeSessionToken, encodeSessionToken, usableSessionSecret } from "./session-token";

const SECRET = "x".repeat(40);
const payload = {
  id: 7,
  email: "a@b.cz",
  name: "A",
  role: "organizer" as const,
  exp: 2_000_000_000,
};

test("a signed token round-trips", () => {
  const token = encodeSessionToken(payload, SECRET);
  assert.deepEqual(decodeSessionToken(token, SECRET, 1_000), payload);
});

test("a wrong signature, an expired token or a short secret are rejected", () => {
  const token = encodeSessionToken(payload, SECRET);
  assert.equal(decodeSessionToken(token, "y".repeat(40), 1_000), null);
  assert.equal(decodeSessionToken(`${token}x`, SECRET, 1_000), null);
  assert.equal(decodeSessionToken(token, SECRET, payload.exp * 1000 + 1), null);
  assert.equal(usableSessionSecret("short"), undefined);
  assert.equal(usableSessionSecret(SECRET), SECRET);
});

test("an unknown role is rejected", () => {
  const token = encodeSessionToken({ ...payload, role: "root" as never }, SECRET);
  assert.equal(decodeSessionToken(token, SECRET, 1_000), null);
});
