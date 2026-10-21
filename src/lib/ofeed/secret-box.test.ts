import assert from "node:assert/strict";
import { test } from "node:test";

import { openSecret, sealSecret } from "./secret-box";

const secret = "x".repeat(40);

test("seal/open round trip, random IV, purpose bound", () => {
  const a = sealSecret("tajne-heslo", secret, "ofeed-password");
  const b = sealSecret("tajne-heslo", secret, "ofeed-password");
  assert.notEqual(a, b);
  assert.ok(!a.includes("tajne"));
  assert.equal(openSecret(a, secret, "ofeed-password"), "tajne-heslo");
  assert.equal(openSecret(a, secret, "other"), null);
  assert.equal(openSecret(a, "y".repeat(40), "ofeed-password"), null);
  assert.equal(openSecret("garbage", secret, "ofeed-password"), null);
  assert.equal(openSecret(a.slice(0, -4) + "AAAA", secret, "ofeed-password"), null);
  assert.throws(() => sealSecret("x", "short", "p"));
});
