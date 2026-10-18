import assert from "node:assert/strict";
import { test } from "node:test";

import { autoConfirmAllowed, isRaceTransaction, matchTransaction, parseVs } from "./match";

const Y = 2026;
const reg =
  (status: number, fee: number, paid = 0) =>
  () => ({ status, fee, paid });
const tx = (amount: number, vs: string | null, currency = "CZK") => ({ amount, vs, currency });

test("only incoming payments with the race-year VS prefix are processed", () => {
  assert.equal(isRaceTransaction({ amount: 300, vs: "202632" }, Y), true);
  assert.equal(isRaceTransaction({ amount: -300, vs: "202632" }, Y), false);
  assert.equal(isRaceTransaction({ amount: 300, vs: "202532" }, Y), false);
  assert.equal(isRaceTransaction({ amount: 300, vs: null }, Y), false);
  assert.deepEqual(matchTransaction(tx(500, "9999"), Y, reg(2, 500)), { kind: "skip" });
});

test("parseVs reads the entry number and rejects malformed symbols", () => {
  assert.equal(parseVs("202632", Y), 32);
  assert.equal(parseVs("20261", Y), 1);
  assert.equal(parseVs("20269999", Y), 9999);
  assert.equal(parseVs("2026", Y), null);
  assert.equal(parseVs("2026032", Y), null);
  assert.equal(parseVs("202612345", Y), null);
  assert.equal(parseVs("2026ab", Y), null);
});

test("exact and overpaid payments match, overpayment is flagged", () => {
  assert.deepEqual(matchTransaction(tx(500, "202632"), Y, reg(2, 500)), {
    kind: "matched",
    year: Y,
    registrationId: 32,
    amount: 500,
    overpaid: 0,
    remaining: 0,
    alreadyConfirmed: false,
  });
  const over = matchTransaction(tx(600, "202632"), Y, reg(2, 500));
  assert.equal(over.kind === "matched" && over.overpaid, 100);
  // Doplatek po dřívější částečné ruční platbě.
  const rest = matchTransaction(tx(200, "202632"), Y, reg(2, 500, 300));
  assert.equal(rest.kind === "matched" && rest.overpaid, 0);
});

test("unmatched reasons", () => {
  const reason = (d: ReturnType<typeof matchTransaction>) =>
    d.kind === "unmatched" ? d.reason : d.kind;
  assert.equal(reason(matchTransaction(tx(500, "202632", "EUR"), Y, reg(2, 500))), "currency");
  assert.equal(reason(matchTransaction(tx(500, "2026x"), Y, reg(2, 500))), "vs_malformed");
  assert.equal(reason(matchTransaction(tx(500.5, "202632"), Y, reg(2, 500))), "fraction");
  assert.equal(reason(matchTransaction(tx(500, "202632"), Y, () => null)), "not_found");
  assert.equal(reason(matchTransaction(tx(500, "202632"), Y, reg(0, 500))), "cancelled");
  assert.equal(reason(matchTransaction(tx(500, "202632"), Y, reg(1, 0))), "empty");
});

test("payment on an already confirmed entry is recorded as overpayment without confirming", () => {
  const d = matchTransaction(tx(500, "202632"), Y, reg(5, 500, 500));
  assert.equal(d.kind, "matched");
  assert.equal(d.kind === "matched" && d.alreadyConfirmed, true);
  assert.equal(d.kind === "matched" && d.overpaid, 500);
});

test("auto-confirm only for payments dated up to 3 December of the race year", () => {
  assert.equal(autoConfirmAllowed("2026-12-03", Y), true);
  assert.equal(autoConfirmAllowed("2026-10-13", Y), true);
  assert.equal(autoConfirmAllowed("2026-12-04", Y), false);
  assert.equal(autoConfirmAllowed("2027-01-02", Y), false);
});

test("partial payments are matched and summed per entry", () => {
  const first = matchTransaction(tx(200, "202632"), Y, reg(2, 500));
  assert.equal(first.kind, "matched");
  assert.equal(first.kind === "matched" && first.remaining, 300);
  assert.equal(first.kind === "matched" && first.overpaid, 0);
  const second = matchTransaction(tx(300, "202632"), Y, reg(2, 500, 200));
  assert.equal(second.kind === "matched" && second.remaining, 0);
  assert.equal(second.kind === "matched" && second.overpaid, 0);
  const third = matchTransaction(tx(400, "202632"), Y, reg(2, 500, 200));
  assert.equal(third.kind === "matched" && third.overpaid, 100);
  // Už přeplacená přihláška: připsat jen nový přeplatek.
  const again = matchTransaction(tx(50, "202632"), Y, reg(4, 500, 600));
  assert.equal(again.kind === "matched" && again.overpaid, 50);
});
