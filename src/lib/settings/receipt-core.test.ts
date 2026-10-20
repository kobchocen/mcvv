import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_RECEIPT_ISSUER,
  normalizeAddress,
  normalizeReceiptIssuer,
  receiptIssuerFromRows,
} from "./receipt-core";

describe("receipt issuer settings", () => {
  it("defaults to the club details", () => {
    assert.deepEqual(receiptIssuerFromRows([]), DEFAULT_RECEIPT_ISSUER);
    assert.deepEqual(DEFAULT_RECEIPT_ISSUER, {
      name: "K.O.B. Choceň, z.s.",
      address: "Vostelčická 256\n565 01 Choceň",
      ico: "15030237",
      vatNote: "Není plátce DPH",
    });
  });

  it("uses stored values and falls back per field when empty", () => {
    assert.deepEqual(
      receiptIssuerFromRows([
        { key: "receipt.issuer_name", text: "  Klub   Test, z.s. " },
        { key: "receipt.issuer_address", text: "" },
        { key: "receipt.issuer_ico", text: "12345678" },
        { key: "receipt.vat_note", text: "   " },
      ]),
      { ...DEFAULT_RECEIPT_ISSUER, name: "Klub Test, z.s.", ico: "12345678" },
    );
  });

  it("normalizes a multi-line address", () => {
    assert.equal(
      normalizeAddress(" Ulice 1 \r\n\r\n 565 01   Choceň \n"),
      "Ulice 1\n565 01 Choceň",
    );
    assert.equal(normalizeAddress("a\nb\nc\nd\ne").split("\n").length, 4);
  });

  it("keeps empty form fields empty so defaults apply", () => {
    assert.deepEqual(normalizeReceiptIssuer({}), { name: "", address: "", ico: "", vatNote: "" });
  });
});
