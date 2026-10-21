import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canCancelRegistration,
  cleanupVerdict,
  parseCleanupArgs,
  type CleanupCandidate,
} from "./empty-registrations";

test("only registrations with runners can be cancelled (status 1 or 2)", () => {
  assert.equal(canCancelRegistration({ status: 1, lineCount: 0 }), false);
  assert.equal(canCancelRegistration({ status: 2, lineCount: 0 }), false);
  assert.equal(canCancelRegistration({ status: 2, lineCount: 3 }), true);
  assert.equal(canCancelRegistration({ status: 1, lineCount: 1 }), true);
  assert.equal(canCancelRegistration({ status: 3, lineCount: 2 }), false);
  assert.equal(canCancelRegistration({ status: 0, lineCount: 2 }), false);
});

const base: CleanupCandidate = {
  year: 2026,
  id: 17,
  status: 1,
  lines: 0,
  payments: 0,
  threads: 0,
  bankTxs: 0,
  hasMeta: false,
};

test("cleanup deletes only untouched empty registrations of the current year", () => {
  assert.equal(cleanupVerdict(base, 2026), "delete");
  assert.equal(cleanupVerdict({ ...base, year: 2025 }, 2026), "other_year");
  assert.equal(cleanupVerdict({ ...base, id: 1 }, 2026), "organizer");
  assert.equal(cleanupVerdict({ ...base, status: 2 }, 2026), "status");
  assert.equal(cleanupVerdict({ ...base, status: null }, 2026), "status");
  assert.equal(cleanupVerdict({ ...base, lines: 1 }, 2026), "lines");
  assert.equal(cleanupVerdict({ ...base, payments: 1 }, 2026), "payments");
  assert.equal(cleanupVerdict({ ...base, threads: 1 }, 2026), "threads");
  assert.equal(cleanupVerdict({ ...base, bankTxs: 1 }, 2026), "bank_tx");
  assert.equal(cleanupVerdict({ ...base, hasMeta: true }, 2026), "meta");
});

test("cleanup script is a dry run unless --apply is given", () => {
  assert.deepEqual(parseCleanupArgs([]), { apply: false, allowRemote: false, year: null });
  assert.deepEqual(parseCleanupArgs(["--apply", "--year=2026"]), {
    apply: true,
    allowRemote: false,
    year: 2026,
  });
  assert.equal(parseCleanupArgs(["--year=abc"]).year, null);
});
