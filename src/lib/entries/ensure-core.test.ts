import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isUniqueViolation,
  nextRegistrationId,
  pickActiveRegistration,
  pickCancelledRegistrations,
  retryOnUniqueViolation,
} from "./ensure-core";

test("first registration of a year gets number 1, then max + 1", () => {
  assert.equal(nextRegistrationId(null), 1);
  assert.equal(nextRegistrationId(undefined), 1);
  assert.equal(nextRegistrationId(0), 1);
  assert.equal(nextRegistrationId(41), 42);
});

const rows = [
  { id: 3, email: "Jana@Example.cz", status: 0 },
  { id: 7, email: "jana@example.cz ", status: 2 },
  { id: 5, email: "petr@example.cz", status: 1 },
  { id: 9, email: "jana@example.cz", status: null },
];

test("active registration ignores cancelled ones and matches e-mail case-insensitively", () => {
  assert.equal(pickActiveRegistration(rows, "JANA@example.cz")?.id, 7);
  assert.equal(pickActiveRegistration(rows, "petr@example.cz")?.id, 5);
  assert.equal(pickActiveRegistration(rows, "nobody@example.cz"), null);
});

test("only cancelled registration means no active one (a new one may be created)", () => {
  const onlyCancelled = [{ id: 3, email: "jana@example.cz", status: 0 }];
  assert.equal(pickActiveRegistration(onlyCancelled, "jana@example.cz"), null);
  assert.deepEqual(
    pickCancelledRegistrations(rows, "jana@example.cz").map((row) => row.id),
    [3],
  );
});

test("retry repeats only unique-key collisions", async () => {
  let calls = 0;
  const value = await retryOnUniqueViolation(async () => {
    calls += 1;
    if (calls < 3) throw Object.assign(new Error("dup"), { code: "P2002" });
    return "ok";
  });
  assert.equal(value, "ok");
  assert.equal(calls, 3);

  let other = 0;
  await assert.rejects(
    retryOnUniqueViolation(async () => {
      other += 1;
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.equal(other, 1);

  await assert.rejects(
    retryOnUniqueViolation(async () => {
      throw Object.assign(new Error("dup"), { code: "P2002" });
    }, 2),
    /dup/,
  );
  assert.equal(isUniqueViolation({ code: "P2025" }), false);
});
