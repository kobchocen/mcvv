import assert from "node:assert/strict";
import test from "node:test";

import { migrateTimeoutMs } from "./migrate-timeout";

test("migrateTimeoutMs defaults to 900 s", () => {
  assert.equal(migrateTimeoutMs({}), 900_000);
  assert.equal(migrateTimeoutMs({ DB_MIGRATE_TIMEOUT_SECONDS: "" }), 900_000);
  assert.equal(migrateTimeoutMs({ DB_MIGRATE_TIMEOUT_SECONDS: "abc" }), 900_000);
  assert.equal(migrateTimeoutMs({ DB_MIGRATE_TIMEOUT_SECONDS: "-5" }), 900_000);
});

test("migrateTimeoutMs reads and clamps the env value", () => {
  assert.equal(migrateTimeoutMs({ DB_MIGRATE_TIMEOUT_SECONDS: "1200" }), 1_200_000);
  assert.equal(migrateTimeoutMs({ DB_MIGRATE_TIMEOUT_SECONDS: "5" }), 30_000);
  assert.equal(migrateTimeoutMs({ DB_MIGRATE_TIMEOUT_SECONDS: "99999" }), 3_600_000);
});
