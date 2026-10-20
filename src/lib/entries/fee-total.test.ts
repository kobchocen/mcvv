import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lineFee, registrationFee, sumPayments } from "./fee-total";

describe("registration fee", () => {
  it("uses the stored line fee, falling back to the category fee", () => {
    assert.equal(lineFee({ entryFee: 150, category: { entryFee: 200 } }), 150);
    assert.equal(lineFee({ entryFee: null, category: { entryFee: 200 } }), 200);
    assert.equal(lineFee({ entryFee: undefined, category: null }), 0);
    assert.equal(lineFee({ entryFee: null }), 0);
  });

  it("keeps a stored 0 Kč (free entry) instead of the category fee", () => {
    assert.equal(lineFee({ entryFee: 0, category: { entryFee: 200 } }), 0);
  });

  it("sums lines and payments", () => {
    assert.equal(
      registrationFee([
        { entryFee: 150, category: { entryFee: 150 } },
        { entryFee: null, category: { entryFee: 50 } },
        { entryFee: 0, category: { entryFee: 150 } },
      ]),
      200,
    );
    assert.equal(registrationFee([]), 0);
    assert.equal(sumPayments([{ amount: 100 }, { amount: null }, { amount: 250 }]), 350);
  });
});
