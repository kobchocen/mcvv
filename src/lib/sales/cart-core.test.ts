import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cartLineChange,
  cartTotals,
  isCartLineOp,
  isSaleAwaitingPayment,
  isSaleOpen,
  onsiteEntryAmount,
  planMerchMerge,
  saleLinesTotal,
} from "./cart-core";
import { SALE_LINES_MAX } from "./core";

const draft = (itemId: number, quantity: number, unitPrice = 100) => ({
  itemId,
  name: `Položka ${itemId}`,
  unitPrice,
  quantity,
  lineTotal: unitPrice * quantity,
});

describe("open cart state (#378)", () => {
  it("open = unpaid without checkout, awaiting payment = unpaid with checkout", () => {
    assert.equal(isSaleOpen({ status: "unpaid", checkoutAt: null }), true);
    assert.equal(isSaleOpen({ status: "unpaid", checkoutAt: new Date() }), false);
    assert.equal(isSaleOpen({ status: "cancelled", checkoutAt: null }), false);
    assert.equal(isSaleOpen({ status: "paid_bank", checkoutAt: null }), false);
    assert.equal(isSaleAwaitingPayment({ status: "unpaid", checkoutAt: new Date() }), true);
    assert.equal(isSaleAwaitingPayment({ status: "unpaid", checkoutAt: null }), false);
    assert.equal(isSaleAwaitingPayment({ status: "paid_cash", checkoutAt: new Date() }), false);
  });
});

describe("cart totals", () => {
  const lines = [
    { entry: true, lineTotal: 250 },
    { entry: true, lineTotal: 150 },
    { entry: false, lineTotal: 300 },
    { entry: false, lineTotal: 80 },
  ];
  it("splits entry fees (runner lines) from merch", () => {
    assert.deepEqual(cartTotals(lines), { entries: 400, merch: 380, total: 780, runners: 2 });
    assert.equal(saleLinesTotal(lines), 780);
    assert.deepEqual(cartTotals([]), { entries: 0, merch: 0, total: 0, runners: 0 });
  });

  it("registration payment = entry fees only, never merch", () => {
    assert.equal(onsiteEntryAmount({ registrationId: 7, total: 780 }, lines), 400);
  });

  it("legacy onsite sale (#222, no entry flag) pays the whole total", () => {
    assert.equal(
      onsiteEntryAmount({ registrationId: 7, total: 250 }, [{ entry: false, lineTotal: 250 }]),
      250,
    );
  });

  it("merch-only sale creates no registration payment", () => {
    assert.equal(
      onsiteEntryAmount({ registrationId: null, total: 300 }, [{ entry: false, lineTotal: 300 }]),
      null,
    );
  });
});

describe("planMerchMerge", () => {
  const existing = [
    { id: 1, itemId: null, entry: true, unitPrice: 250, quantity: 1 },
    { id: 2, itemId: 10, entry: false, unitPrice: 100, quantity: 2 },
  ];

  it("adds quantity to the same item at the same price", () => {
    assert.deepEqual(planMerchMerge(existing, [draft(10, 3)]), {
      ok: true,
      update: [{ id: 2, quantity: 5, lineTotal: 500 }],
      create: [],
    });
  });

  it("creates a new line for a new item or a changed price", () => {
    const plan = planMerchMerge(existing, [draft(11, 1), draft(10, 1, 120)]);
    assert.ok(plan.ok);
    assert.deepEqual(plan.update, []);
    assert.deepEqual(
      plan.create.map((line) => [line.itemId, line.unitPrice]),
      [
        [11, 100],
        [10, 120],
      ],
    );
  });

  it("never merges merch into an entry line", () => {
    const plan = planMerchMerge(
      [{ id: 1, itemId: null, entry: true, unitPrice: 100, quantity: 1 }],
      [draft(10, 1)],
    );
    assert.ok(plan.ok);
    assert.equal(plan.create.length, 1);
  });

  it("guards quantity per line and lines per sale", () => {
    assert.deepEqual(planMerchMerge(existing, [draft(10, 98)]), { ok: false, error: "quantity" });
    const full = Array.from({ length: SALE_LINES_MAX }, (_, i) => ({
      id: i + 1,
      itemId: i + 100,
      entry: false,
      unitPrice: 1,
      quantity: 1,
    }));
    assert.deepEqual(planMerchMerge(full, [draft(10, 1)]), { ok: false, error: "too_many" });
    assert.ok(planMerchMerge(full, [draft(100, 1, 1)]).ok, "merging into a full sale is fine");
  });
});

describe("cartLineChange", () => {
  it("merch +/− and remove", () => {
    assert.deepEqual(cartLineChange({ entry: false, quantity: 2 }, "inc"), {
      ok: true,
      quantity: 3,
    });
    assert.deepEqual(cartLineChange({ entry: false, quantity: 1 }, "dec"), {
      ok: true,
      quantity: 0,
    });
    assert.deepEqual(cartLineChange({ entry: false, quantity: 99 }, "inc"), {
      ok: false,
      error: "quantity",
    });
    assert.deepEqual(cartLineChange({ entry: false, quantity: 4 }, "remove"), {
      ok: true,
      quantity: 0,
    });
  });

  it("runner line can only be removed as a whole", () => {
    assert.deepEqual(cartLineChange({ entry: true, quantity: 1 }, "inc"), {
      ok: false,
      error: "quantity",
    });
    assert.deepEqual(cartLineChange({ entry: true, quantity: 1 }, "remove"), {
      ok: true,
      quantity: 0,
    });
  });

  it("validates the operation", () => {
    assert.equal(isCartLineOp("inc"), true);
    assert.equal(isCartLineOp("drop"), false);
    assert.equal(isCartLineOp(undefined), false);
  });
});
