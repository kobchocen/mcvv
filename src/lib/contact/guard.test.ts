import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LIMITS,
  MAX_TOKEN_AGE_MS,
  MIN_FILL_MS,
  issueFormToken,
  validateContactInput,
  verifyFormToken,
} from "./guard";

const SECRET = "x".repeat(40);
const T0 = 1_760_000_000_000;

test("token: platný po minimální době vyplnění", () => {
  const token = issueFormToken(SECRET, T0);
  assert.equal(verifyFormToken(token, SECRET, T0 + MIN_FILL_MS + 1), "ok");
});

test("token: příliš rychlé odeslání a expirace", () => {
  const token = issueFormToken(SECRET, T0);
  assert.equal(verifyFormToken(token, SECRET, T0 + 500), "too-fast");
  assert.equal(verifyFormToken(token, SECRET, T0 + MAX_TOKEN_AGE_MS + 1), "expired");
});

test("token: podvržený čas, jiný secret nebo nesmysl je neplatný", () => {
  const token = issueFormToken(SECRET, T0);
  const [, sig] = token.split(".");
  assert.equal(verifyFormToken(`${T0 - 60_000}.${sig}`, SECRET, T0 + 10_000), "invalid");
  assert.equal(verifyFormToken(token, "y".repeat(40), T0 + 10_000), "invalid");
  assert.equal(verifyFormToken("", SECRET, T0), "invalid");
  assert.equal(verifyFormToken("abc.def", SECRET, T0), "invalid");
});

const ok = { name: "Jan Novák", email: "jan@example.cz", message: "Dobrý den, dotaz k trati." };

test("validace: platný vstup projde a je otrimován", () => {
  assert.deepEqual(validateContactInput({ ...ok, name: "  Jan Novák " }), ok);
});

test("validace: CR/LF v jménu či e-mailu (header injection) je odmítnut", () => {
  assert.equal(validateContactInput({ ...ok, name: "Jan\r\nBcc: x@y.cz" }), null);
  assert.equal(validateContactInput({ ...ok, email: "a@b.cz\nBcc: x@y.cz" }), null);
  assert.equal(validateContactInput({ ...ok, email: "a@b.cz, c@d.cz" }), null);
});

test("validace: délkové limity", () => {
  assert.equal(validateContactInput({ ...ok, name: "J" }), null);
  assert.equal(validateContactInput({ ...ok, name: "J".repeat(LIMITS.nameMax + 1) }), null);
  assert.equal(validateContactInput({ ...ok, message: "krátká" }), null);
  assert.equal(validateContactInput({ ...ok, message: "a".repeat(LIMITS.messageMax + 1) }), null);
  assert.equal(validateContactInput({ ...ok, email: `${"a".repeat(250)}@b.cz` }), null);
  assert.equal(validateContactInput({ ...ok, message: 42 }), null);
});
