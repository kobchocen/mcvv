import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ENTRY_STATUS } from "./status-codes";
import { isEntryValid } from "./valid";

describe("isEntryValid", () => {
  it("fee 0 Kč, not confirmed => valid (organizer, winners, veterans)", () => {
    assert.equal(
      isEntryValid({ status: ENTRY_STATUS.unpaid, lineCount: 2, fee: 0, paid: 0 }),
      true,
    );
    assert.equal(isEntryValid({ status: ENTRY_STATUS.empty, lineCount: 1, fee: 0, paid: 0 }), true);
  });
  it("fee > 0 unpaid or underpaid => not valid", () => {
    assert.equal(
      isEntryValid({ status: ENTRY_STATUS.unpaid, lineCount: 2, fee: 400, paid: 0 }),
      false,
    );
    assert.equal(
      isEntryValid({ status: ENTRY_STATUS.unpaid, lineCount: 2, fee: 400, paid: 300 }),
      false,
    );
  });
  it("paid or overpaid => valid, even with a stale stored status", () => {
    assert.equal(
      isEntryValid({ status: ENTRY_STATUS.paid, lineCount: 2, fee: 400, paid: 400 }),
      true,
    );
    assert.equal(
      isEntryValid({ status: ENTRY_STATUS.overpaid, lineCount: 2, fee: 400, paid: 500 }),
      true,
    );
    assert.equal(
      isEntryValid({ status: ENTRY_STATUS.unpaid, lineCount: 2, fee: 400, paid: 400 }),
      true,
    );
  });
  it("confirmed => valid", () => {
    assert.equal(
      isEntryValid({ status: ENTRY_STATUS.confirmed, lineCount: 1, fee: 200, paid: 0 }),
      true,
    );
  });
  it("cancelled or without runners => not valid", () => {
    assert.equal(
      isEntryValid({ status: ENTRY_STATUS.cancelled, lineCount: 2, fee: 0, paid: 0 }),
      false,
    );
    assert.equal(isEntryValid({ status: ENTRY_STATUS.paid, lineCount: 0, fee: 0, paid: 0 }), false);
  });
});
