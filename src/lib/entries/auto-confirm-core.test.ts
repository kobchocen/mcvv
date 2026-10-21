import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FREE_AUTO_CONFIRM_QUIET_MS,
  freeConfirmDedupeKey,
  isFreeAutoConfirmDue,
  lastModifiedOf,
  showFreeAutoBadge,
} from "./auto-confirm-core";
import { nextStatus } from "./status";
import { ENTRY_STATUS } from "./status-codes";

const now = new Date("2026-11-01T12:00:00Z");
const base = {
  status: ENTRY_STATUS.paid as number,
  lineCount: 2,
  fee: 0,
  paid: 0,
  email: "veteran@example.cz",
  lastModified: new Date(now.getTime() - FREE_AUTO_CONFIRM_QUIET_MS),
};

test("čekací doba je 45 minut (dohoda 30–60 min)", () => {
  assert.equal(FREE_AUTO_CONFIRM_QUIET_MS, 45 * 60 * 1000);
});

test("potvrdí přihlášku 0 Kč, která se 45 min nezměnila", () => {
  assert.equal(isFreeAutoConfirmDue(base, now), true);
});

test("nepotvrdí: čerstvá změna, placené startovné, platba, prázdná, jiný stav, bez e-mailu", () => {
  const cases = [
    { lastModified: new Date(now.getTime() - FREE_AUTO_CONFIRM_QUIET_MS + 1000) },
    { lastModified: null },
    { fee: 250 },
    { paid: 100 },
    { lineCount: 0 },
    { status: ENTRY_STATUS.unpaid },
    { status: ENTRY_STATUS.confirmed },
    { status: ENTRY_STATUS.overpaid },
    { email: " " },
  ];
  for (const change of cases) {
    assert.equal(isFreeAutoConfirmDue({ ...base, ...change }, now), false, JSON.stringify(change));
  }
});

test("přidaný placený běžec vrátí potvrzenou přihlášku na nezaplaceno (2)", () => {
  assert.equal(nextStatus(ENTRY_STATUS.confirmed, 3, 250, 0), ENTRY_STATUS.unpaid);
  // a bez placeného běžce zůstává potvrzená
  assert.equal(nextStatus(ENTRY_STATUS.confirmed, 2, 0, 0), ENTRY_STATUS.confirmed);
  // nová přihláška 0 Kč má po přepočtu stav 3 – kandidát jobu
  assert.equal(nextStatus(ENTRY_STATUS.empty, 1, 0, 0), ENTRY_STATUS.paid);
});

test("poslední změna = nejnovější známý čas", () => {
  assert.deepEqual(
    lastModifiedOf([null, new Date("2026-10-01T10:00:00Z"), new Date("2026-10-02T10:00:00Z")]),
    new Date("2026-10-02T10:00:00Z"),
  );
  assert.equal(lastModifiedOf([null, undefined]), null);
});

test("klíč e-mailu: stejní běžci = stejný klíč (nezávisle na pořadí), jiní = jiný", () => {
  const a = freeConfirmDedupeKey(2026, 7, ["19500012", "19400003"]);
  assert.equal(a, freeConfirmDedupeKey(2026, 7, ["19400003", "19500012"]));
  assert.notEqual(a, freeConfirmDedupeKey(2026, 7, ["19400003"]));
  assert.match(a, /^confirm-free:2026:7:[0-9a-f]{16}$/);
  assert.ok(a.length <= 120);
});

test("odznak jen u potvrzené přihlášky 0 Kč, kterou potvrdil job", () => {
  assert.equal(showFreeAutoBadge({ status: 5, fee: 0, autoConfirmed: true }), true);
  assert.equal(showFreeAutoBadge({ status: 5, fee: 0, autoConfirmed: false }), false);
  assert.equal(showFreeAutoBadge({ status: 5, fee: 250, autoConfirmed: true }), false);
  assert.equal(showFreeAutoBadge({ status: 2, fee: 0, autoConfirmed: true }), false);
});
