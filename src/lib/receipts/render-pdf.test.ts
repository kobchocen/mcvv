import assert from "node:assert/strict";
import { describe, it } from "node:test";

import cs from "@/i18n/locales/cs/common.json";
import en from "@/i18n/locales/en/common.json";
import { DEFAULT_RECEIPT_ISSUER } from "@/lib/settings/receipt-core";

import { loadReceiptFonts } from "./fonts";
import { receiptTranslator } from "./labels";
import type { ReceiptDocument } from "./receipt-core";
import { renderReceiptPdf } from "./render-pdf";

const receipt: ReceiptDocument = {
  number: "MCVV2026-042",
  year: 2026,
  registrationId: 42,
  variableSymbol: "202642",
  issueDate: new Date("2026-11-21T00:00:00Z"),
  raceDate: new Date("2026-12-06T09:15:00Z"),
  payerName: "Rodina Příkladová",
  payerEmail: "jana@example.com",
  issuer: DEFAULT_RECEIPT_ISSUER,
  lines: [{ runner: "Příkladová Jana", birthYear: "1985", club: "SK", category: "D", fee: 150 }],
  payments: [{ date: new Date("2026-11-21T00:00:00Z"), method: "bank", amount: 180 }],
  fee: 150,
  paid: 180,
  overpaid: 30,
  generatedAt: new Date("2026-11-22T08:00:00Z"),
};

describe("receipt labels", () => {
  it("has the same keys in Czech and English", () => {
    assert.deepEqual(Object.keys(en.Receipt).sort(), Object.keys(cs.Receipt).sort());
  });

  it("interpolates placeholders", () => {
    assert.equal(receiptTranslator("cs")("number", { number: "MCVV2026-042" }), "č. MCVV2026-042");
    assert.equal(receiptTranslator("en")("title"), "Payment receipt");
    assert.equal(receiptTranslator("cs")("title"), "Doklad o zaplacení startovného");
  });
});

describe("renderReceiptPdf", () => {
  for (const locale of ["cs", "en"] as const) {
    it(`renders a PDF with the bundled fonts (${locale})`, async () => {
      const pdf = renderReceiptPdf(
        receipt,
        locale,
        receiptTranslator(locale),
        await loadReceiptFonts(),
      );
      const head = Buffer.from(pdf.subarray(0, 5)).toString("latin1");
      assert.equal(head, "%PDF-");
      const body = Buffer.from(pdf).toString("latin1");
      assert.match(body, /DejaVu/);
      assert.ok(pdf.length > 5000);
    });
  }
});
