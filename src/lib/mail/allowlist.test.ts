import assert from "node:assert/strict";
import test from "node:test";

import { maskRecipient, parseAllowedRecipients, recipientAllowed } from "./allowlist";

test("allowlist: unset or empty means no restriction", () => {
  assert.equal(parseAllowedRecipients(undefined), null);
  assert.equal(parseAllowedRecipients("  "), null);
  assert.equal(recipientAllowed("runner@example.cz", null), true);
});

test("allowlist: exact e-mails and @domains, case-insensitive", () => {
  const allow = parseAllowedRecipients(" Pavel@Example.cz, @test.mcvv.org;qa@x.cz\n");
  assert.equal(recipientAllowed("pavel@example.cz", allow), true);
  assert.equal(recipientAllowed(" PAVEL@example.CZ ", allow), true);
  assert.equal(recipientAllowed("anyone@test.mcvv.org", allow), true);
  assert.equal(recipientAllowed("qa@x.cz", allow), true);
  assert.equal(recipientAllowed("runner@example.cz", allow), false);
  assert.equal(recipientAllowed("someone@mcvv.org", allow), false);
  assert.equal(recipientAllowed("evil@test.mcvv.org.attacker.cz", allow), false);
});

test("allowlist: a value without any valid item blocks everything", () => {
  const allow = parseAllowedRecipients(",;");
  assert.notEqual(allow, null);
  assert.equal(recipientAllowed("pavel@example.cz", allow), false);
});

test("maskRecipient hides the local part", () => {
  assert.equal(maskRecipient("jana.novakova@example.cz"), "j…@example.cz");
  assert.equal(maskRecipient("bad"), "…");
});
