import assert from "node:assert/strict";
import { test } from "node:test";

import {
  envMailPolicy,
  MAIL_DAILY_CAP_KEY,
  MAIL_PRIORITY_RESERVE_KEY,
  MAIL_UNLIMITED_KEY,
  mailSettingsFromRows,
  parseMailSettingsInput,
  resolveMailPolicy,
  sameMailSettings,
} from "./mail-core";

const noEnv = {};

test("without stored settings the policy is the same as before (env, then 90 / 15)", () => {
  assert.deepEqual(resolveMailPolicy(null, noEnv), { cap: 90, reserve: 15 });
  assert.deepEqual(resolveMailPolicy(mailSettingsFromRows([]), noEnv), { cap: 90, reserve: 15 });
  const env = { MAIL_DAILY_CAP: "80", MAIL_PRIORITY_RESERVE: "10" };
  assert.deepEqual(envMailPolicy(env), { cap: 80, reserve: 10 });
  assert.deepEqual(resolveMailPolicy(mailSettingsFromRows([]), env), { cap: 80, reserve: 10 });
  // Prázdné hodnoty (uložený formulář bez vyplnění) = env.
  const empty = mailSettingsFromRows([
    { key: MAIL_DAILY_CAP_KEY, text: "" },
    { key: MAIL_PRIORITY_RESERVE_KEY, text: "" },
    { key: MAIL_UNLIMITED_KEY, text: "0" },
  ]);
  assert.deepEqual(resolveMailPolicy(empty, env), { cap: 80, reserve: 10 });
});

test("stored settings override env; unlimited switches the cap off", () => {
  const rows = [
    { key: MAIL_DAILY_CAP_KEY, text: "950" },
    { key: MAIL_PRIORITY_RESERVE_KEY, text: "50" },
  ];
  assert.deepEqual(resolveMailPolicy(mailSettingsFromRows(rows), { MAIL_DAILY_CAP: "80" }), {
    cap: 950,
    reserve: 50,
  });
  const unlimited = mailSettingsFromRows([...rows, { key: MAIL_UNLIMITED_KEY, text: "1" }]);
  assert.deepEqual(resolveMailPolicy(unlimited, noEnv), { cap: 950, reserve: 50, unlimited: true });
});

test("invalid stored values fall back to env", () => {
  const settings = mailSettingsFromRows([
    { key: MAIL_DAILY_CAP_KEY, text: "0" },
    { key: MAIL_PRIORITY_RESERVE_KEY, text: "-3" },
  ]);
  assert.deepEqual(settings, { dailyCap: null, priorityReserve: null, unlimited: false });
});

test("parseMailSettingsInput validates the admin form", () => {
  const ok = parseMailSettingsInput(
    { dailyCap: " 200 ", priorityReserve: "20", unlimited: false },
    noEnv,
  );
  assert.deepEqual(ok, {
    ok: true,
    value: { dailyCap: 200, priorityReserve: 20, unlimited: false },
  });
  assert.deepEqual(
    parseMailSettingsInput({ dailyCap: "", priorityReserve: "", unlimited: true }, noEnv),
    { ok: true, value: { dailyCap: null, priorityReserve: null, unlimited: true } },
  );
  for (const dailyCap of ["0", "abc", "1.5", "100001"]) {
    assert.deepEqual(
      parseMailSettingsInput({ dailyCap, priorityReserve: "", unlimited: false }, noEnv),
      { ok: false, error: "mailCap" },
    );
  }
  assert.deepEqual(
    parseMailSettingsInput({ dailyCap: "", priorityReserve: "x", unlimited: false }, noEnv),
    { ok: false, error: "mailReserve" },
  );
  // Rezerva musí být menší než výsledný limit (i proti env fallbacku).
  assert.deepEqual(
    parseMailSettingsInput({ dailyCap: "10", priorityReserve: "", unlimited: false }, noEnv),
    { ok: false, error: "mailReserve" },
  );
  assert.deepEqual(
    parseMailSettingsInput({ dailyCap: "", priorityReserve: "90", unlimited: false }, noEnv),
    { ok: false, error: "mailReserve" },
  );
});

test("sameMailSettings detects changes for the audit", () => {
  const a = { dailyCap: 90, priorityReserve: null, unlimited: false };
  assert.equal(sameMailSettings(a, { ...a }), true);
  assert.equal(sameMailSettings(a, { ...a, unlimited: true }), false);
});
