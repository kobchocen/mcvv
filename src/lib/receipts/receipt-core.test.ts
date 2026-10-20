import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_RECEIPT_ISSUER } from "@/lib/settings/receipt-core";

import {
  buildReceipt,
  canDownloadReceipt,
  completionDate,
  formatAmount,
  formatCalendarDate,
  isReceiptEligible,
  parseReceiptLocale,
  paymentMethod,
  receiptFilename,
  receiptNumber,
  type ReceiptPaymentInput,
  type ReceiptSourceLine,
} from "./receipt-core";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const pay = (
  id: number,
  date: string | null,
  amount: number,
  author: string | null = "fio",
): ReceiptPaymentInput => ({
  id,
  date: date ? day(date) : null,
  created: new Date("2026-11-30T10:00:00Z"),
  amount,
  author,
});
const line = (
  runnerId: string,
  name: string,
  entryFee: number | null,
  categoryFee = 150,
): ReceiptSourceLine => ({
  runnerId,
  entryFee,
  runner: { name },
  club: { name: "SK Příklad" },
  category: { name: "H", entryFee: categoryFee },
});

describe("receipt number and access", () => {
  it("formats a stable number and filename", () => {
    assert.equal(receiptNumber(2026, 42), "MCVV2026-042");
    assert.equal(receiptNumber(2026, 7), "MCVV2026-007");
    assert.equal(receiptNumber(2026, 1234), "MCVV2026-1234");
    assert.equal(receiptFilename(2026, 42), "doklad-MCVV2026-042.pdf");
  });

  it("parses the locale, defaulting to Czech", () => {
    assert.equal(parseReceiptLocale("en"), "en");
    assert.equal(parseReceiptLocale("cs"), "cs");
    assert.equal(parseReceiptLocale("de"), "cs");
    assert.equal(parseReceiptLocale(null), "cs");
  });

  it("lets the owner download only the current year's receipt", () => {
    const base = {
      staff: false,
      sessionEmail: "Jana@Example.com",
      registrationEmail: " jana@example.com ",
      year: 2026,
      currentYear: 2026,
    };
    assert.equal(canDownloadReceipt(base), true);
    assert.equal(canDownloadReceipt({ ...base, year: 2025 }), false);
    assert.equal(canDownloadReceipt({ ...base, registrationEmail: "jiny@example.com" }), false);
    assert.equal(canDownloadReceipt({ ...base, registrationEmail: null }), false);
    assert.equal(canDownloadReceipt({ ...base, sessionEmail: "", registrationEmail: "" }), false);
  });

  it("lets staff download any registration", () => {
    assert.equal(
      canDownloadReceipt({
        staff: true,
        sessionEmail: "poradatel@example.com",
        registrationEmail: "jana@example.com",
        year: 2019,
        currentYear: 2026,
      }),
      true,
    );
  });
});

describe("receipt eligibility", () => {
  it("requires a non-cancelled, fully paid entry with a fee", () => {
    const ok = { status: 3, lineCount: 2, fee: 300, paid: 300 };
    assert.equal(isReceiptEligible(ok), true);
    assert.equal(isReceiptEligible({ ...ok, status: 5 }), true);
    assert.equal(isReceiptEligible({ ...ok, status: null }), true);
    assert.equal(isReceiptEligible({ ...ok, paid: 400 }), true);
    assert.equal(isReceiptEligible({ ...ok, paid: 299 }), false);
    assert.equal(isReceiptEligible({ ...ok, status: 0 }), false);
    assert.equal(isReceiptEligible({ ...ok, lineCount: 0 }), false);
    assert.equal(isReceiptEligible({ ...ok, fee: 0, paid: 0 }), false);
  });

  it("dates the receipt by the payment that completed the fee", () => {
    const payments = [
      pay(3, "2026-11-21", 150),
      pay(1, "2026-11-18", 200),
      pay(4, "2026-11-25", 50),
    ];
    assert.deepEqual(completionDate(payments, 350), day("2026-11-21"));
    assert.deepEqual(completionDate(payments, 200), day("2026-11-18"));
    assert.equal(completionDate(payments, 500), null);
  });

  it("falls back to the Prague day of entry when a payment has no date", () => {
    const late = {
      ...pay(1, null, 300, "admin"),
      created: new Date("2026-11-30T23:30:00Z"),
    };
    assert.deepEqual(completionDate([late], 300), day("2026-12-01"));
  });

  it("labels Fio payments as bank transfers and the rest as organizer entries", () => {
    assert.equal(paymentMethod("fio"), "bank");
    assert.equal(paymentMethod("admin"), "organizer");
    assert.equal(paymentMethod(null), "organizer");
  });
});

describe("buildReceipt", () => {
  const base = {
    year: 2026,
    id: 42,
    email: "jana@example.com",
    name: "Rodina Příkladová",
    status: 5,
    lines: [line("19855001", "Příkladová Jana", 150), line("20150001", "Příklad Tomáš", null, 50)],
    payments: [pay(2, "2026-11-21", 100), pay(1, "2026-11-18", 100, "admin")],
    issuer: DEFAULT_RECEIPT_ISSUER,
    raceDate: new Date("2026-12-06T09:15:00Z"),
    now: new Date("2026-11-22T08:00:00Z"),
  };

  it("builds the document for a fully paid entry", () => {
    const receipt = buildReceipt(base);
    assert.ok(receipt);
    assert.equal(receipt.number, "MCVV2026-042");
    assert.equal(receipt.variableSymbol, "202642");
    assert.equal(receipt.fee, 200);
    assert.equal(receipt.paid, 200);
    assert.equal(receipt.overpaid, 0);
    assert.deepEqual(receipt.issueDate, day("2026-11-21"));
    assert.equal(receipt.payerName, "Rodina Příkladová");
    assert.deepEqual(
      receipt.lines.map((row) => [row.runner, row.birthYear, row.fee]),
      [
        ["Příkladová Jana", "1985", 150],
        ["Příklad Tomáš", "2015", 50],
      ],
    );
    assert.deepEqual(
      receipt.payments.map((row) => [row.method, row.amount]),
      [
        ["organizer", 100],
        ["bank", 100],
      ],
    );
  });

  it("reports an overpayment for information only", () => {
    const receipt = buildReceipt({
      ...base,
      payments: [...base.payments, pay(5, "2026-11-25", 30)],
    });
    assert.equal(receipt?.paid, 230);
    assert.equal(receipt?.overpaid, 30);
  });

  it("falls back to the first runner as payer", () => {
    assert.equal(buildReceipt({ ...base, name: "  " })?.payerName, "Příkladová Jana");
  });

  it("returns null when not eligible", () => {
    assert.equal(buildReceipt({ ...base, payments: [pay(1, "2026-11-18", 199)] }), null);
    assert.equal(buildReceipt({ ...base, status: 0 }), null);
    assert.equal(buildReceipt({ ...base, lines: [] }), null);
    assert.equal(
      buildReceipt({ ...base, lines: [line("19855001", "Jana", 0)], payments: [] }),
      null,
    );
  });
});

describe("formatting", () => {
  it("formats amounts and calendar dates per locale", () => {
    assert.equal(formatAmount(1350, "cs"), "1 350 Kč");
    assert.equal(formatAmount(350, "cs"), "350 Kč");
    assert.equal(formatAmount(1350, "en"), "CZK 1,350");
    assert.equal(formatCalendarDate(day("2026-11-21"), "cs"), "21. 11. 2026");
    assert.equal(formatCalendarDate(day("2026-11-21"), "en"), "21 Nov 2026");
  });
});
