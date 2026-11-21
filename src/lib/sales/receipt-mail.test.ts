import assert from "node:assert/strict";
import { test } from "node:test";

import {
  RECEIPT_LOCALES,
  receiptLocale,
  renderSaleReceipt,
  type ReceiptSale,
} from "./receipt-mail";

const sale: ReceiptSale = {
  number: 42,
  vs: "2026000042",
  total: 650,
  status: "new",
  paidAt: null,
  lines: [
    { name: "Startovné <dospělí>", quantity: 2, unitPrice: 250, lineTotal: 500 },
    { name: "Tričko", quantity: 1, unitPrice: 150, lineTotal: 150 },
  ],
};
const base = { site: "https://mcvv.org", account: "123456789/0100" };

test("receiptLocale: jazyk prodejky, jinak cs", () => {
  for (const l of RECEIPT_LOCALES) assert.equal(receiptLocale(l), l);
  assert.equal(receiptLocale("sk"), "cs");
  assert.equal(receiptLocale(null), "cs");
  assert.equal(receiptLocale(undefined), "cs");
});

test("účtenka obsahuje položky, kusy, ceny, celkem, stav platby a VS", () => {
  const { subject, html, text } = renderSaleReceipt({ sale, locale: "cs", ...base });
  assert.equal(subject, "Účtenka MCVV č. 42");
  assert.match(text, /Startovné <dospělí> – 2 × 250 Kč = 500 Kč/);
  assert.match(text, /Tričko – 1 × 150 Kč = 150 Kč/);
  assert.match(text, /Celkem k úhradě: 650 Kč/);
  assert.match(text, /Variabilní symbol: 2026000042/);
  assert.match(text, /Nezaplaceno – převodem na účet 123456789\/0100/);
  // HTML je escapované
  assert.ok(html.includes("Startovné &lt;dospělí&gt;"));
  assert.ok(!html.includes("<dospělí>"));
  assert.match(html, /lang="cs"/);
});

test("stav platby: hotově, převodem, storno", () => {
  const paidAt = new Date("2026-12-06T09:30:00Z");
  assert.match(
    renderSaleReceipt({ sale: { ...sale, status: "paid_cash", paidAt }, locale: "cs", ...base })
      .text,
    /Zaplaceno hotově \(.*10:30.*\)/,
  );
  assert.match(
    renderSaleReceipt({ sale: { ...sale, status: "paid_bank", paidAt }, locale: "en", ...base })
      .text,
    /Paid by bank transfer/,
  );
  assert.match(
    renderSaleReceipt({ sale: { ...sale, status: "cancelled" }, locale: "de", ...base }).text,
    /storniert/,
  );
});

test("všech pět jazyků má vlastní předmět a jazyk dokumentu", () => {
  const subjects = new Set(
    RECEIPT_LOCALES.map((locale) => {
      const r = renderSaleReceipt({ sale, locale, ...base });
      assert.match(r.html, new RegExp(`lang="${locale}"`));
      assert.match(r.text, /2026000042/);
      return r.subject;
    }),
  );
  assert.equal(subjects.size, RECEIPT_LOCALES.length);
});
