import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseVs } from "@/lib/payments/match";

import {
  buildSaleLines,
  cartTotal,
  dailySummary,
  matchSaleTransaction,
  parseSaleFilter,
  parseSaleItemInput,
  parseSaleVs,
  pragueDay,
  pragueDayRange,
  saleQrMessage,
  saleVs,
} from "./core";

const Y = 2026;
const tx = (amount: number, vs: string | null, currency = "CZK") => ({ amount, vs, currency });

describe("sale VS", () => {
  it("is year + 9 + five-digit number and round-trips", () => {
    assert.equal(saleVs(Y, 1), "2026900001");
    assert.equal(saleVs(Y, 99_999), "2026999999");
    assert.equal(parseSaleVs("2026900001", Y), 1);
    assert.equal(parseSaleVs(" 2026900123 ", Y), 123);
    assert.throws(() => saleVs(Y, 0));
    assert.throws(() => saleVs(Y, 100_000));
  });
  it("rejects other years, zero and other shapes", () => {
    assert.equal(parseSaleVs("2025900001", Y), null);
    assert.equal(parseSaleVs("2026900000", Y), null);
    assert.equal(parseSaleVs("202690001", Y), null);
    assert.equal(parseSaleVs("20269000011", Y), null);
    assert.equal(parseSaleVs("2026800001", Y), null);
  });
  it("never collides with a registration VS (year + 1–9999)", () => {
    for (const n of [1, 9, 10, 99, 100, 999, 1000, 9999, 12345, 99_999]) {
      assert.equal(parseVs(saleVs(Y, n), Y), null, `sale ${n}`);
    }
    for (const id of [1, 9, 90, 900, 9000, 9999]) {
      assert.equal(parseSaleVs(`${Y}${id}`, Y), null, `registration ${id}`);
    }
  });
  it("QR message carries the VS", () => {
    assert.equal(saleQrMessage("2026900007"), "MCVV PRODEJKA 2026900007");
  });
});

describe("buildSaleLines", () => {
  const items = [
    { id: 1, name: "Dohláška", price: 300, active: true },
    { id: 2, name: "Tričko", price: 250, active: true },
    { id: 3, name: "Stará čelenka", price: 100, active: false },
  ];
  it("prices come from the price list, zero quantities are skipped, order follows the list", () => {
    const r = buildSaleLines(
      [
        { itemId: 2, quantity: 2 },
        { itemId: 1, quantity: 1 },
        { itemId: 3, quantity: 0 },
      ],
      items,
    );
    assert.deepEqual(r, {
      ok: true,
      total: 800,
      lines: [
        { itemId: 1, name: "Dohláška", unitPrice: 300, quantity: 1, lineTotal: 300 },
        { itemId: 2, name: "Tričko", unitPrice: 250, quantity: 2, lineTotal: 500 },
      ],
    });
  });
  it("merges duplicate item rows", () => {
    const r = buildSaleLines(
      [
        { itemId: 2, quantity: 1 },
        { itemId: 2, quantity: 2 },
      ],
      items,
    );
    assert.ok(r.ok);
    assert.equal(r.ok && r.lines[0]!.quantity, 3);
  });
  it("rejects empty carts, inactive or unknown items and bad quantities", () => {
    assert.deepEqual(buildSaleLines([], items), { ok: false, error: "empty" });
    assert.deepEqual(buildSaleLines([{ itemId: 1, quantity: 0 }], items), {
      ok: false,
      error: "empty",
    });
    assert.deepEqual(buildSaleLines([{ itemId: 3, quantity: 1 }], items), {
      ok: false,
      error: "item",
    });
    assert.deepEqual(buildSaleLines([{ itemId: 9, quantity: 1 }], items), {
      ok: false,
      error: "item",
    });
    assert.deepEqual(buildSaleLines([{ itemId: 1, quantity: -1 }], items), {
      ok: false,
      error: "quantity",
    });
    assert.deepEqual(buildSaleLines([{ itemId: 1, quantity: 1.5 }], items), {
      ok: false,
      error: "quantity",
    });
    assert.deepEqual(buildSaleLines([{ itemId: 1, quantity: 100 }], items), {
      ok: false,
      error: "quantity",
    });
  });
  it("cartTotal mirrors the server total for display", () => {
    assert.equal(cartTotal(items, { 1: 1, 2: 2 }), 800);
    assert.equal(cartTotal(items, {}), 0);
  });
});

describe("matchSaleTransaction", () => {
  const unpaid = () => ({ id: 5, total: 550, status: "unpaid" });
  it("non-sale VS falls through to registration matching", () => {
    assert.deepEqual(matchSaleTransaction(tx(550, "20261"), Y, unpaid), { kind: "not_sale" });
    assert.deepEqual(matchSaleTransaction(tx(550, null), Y, unpaid), { kind: "not_sale" });
    assert.deepEqual(matchSaleTransaction(tx(550, "2025900001"), Y, unpaid), {
      kind: "not_sale",
    });
    assert.deepEqual(matchSaleTransaction(tx(-550, "2026900001"), Y, unpaid), {
      kind: "not_sale",
    });
  });
  it("matches only the exact amount in CZK on an unpaid sale", () => {
    assert.deepEqual(matchSaleTransaction(tx(550, "2026900001"), Y, unpaid), {
      kind: "matched",
      saleId: 5,
      amount: 550,
    });
    const un = (amount: number, status: string, currency = "CZK") =>
      matchSaleTransaction(tx(amount, "2026900001", currency), Y, () => ({
        id: 5,
        total: 550,
        status,
      }));
    assert.deepEqual(un(500, "unpaid"), { kind: "unmatched", reason: "sale_amount", saleId: 5 });
    assert.deepEqual(un(600, "unpaid"), { kind: "unmatched", reason: "sale_amount", saleId: 5 });
    assert.deepEqual(un(550.5, "unpaid"), { kind: "unmatched", reason: "fraction", saleId: 5 });
    assert.deepEqual(un(550, "unpaid", "EUR"), {
      kind: "unmatched",
      reason: "currency",
      saleId: 5,
    });
    assert.deepEqual(un(550, "cancelled"), {
      kind: "unmatched",
      reason: "sale_cancelled",
      saleId: 5,
    });
    assert.deepEqual(un(550, "paid_cash"), { kind: "unmatched", reason: "sale_paid", saleId: 5 });
    assert.deepEqual(un(550, "paid_bank"), { kind: "unmatched", reason: "sale_paid", saleId: 5 });
  });
  it("unknown sale number goes to manual review", () => {
    assert.deepEqual(
      matchSaleTransaction(tx(550, "2026900042"), Y, () => null),
      {
        kind: "unmatched",
        reason: "sale_not_found",
        saleId: null,
      },
    );
  });
});

describe("daily totals and filters", () => {
  it("groups by Prague day (late evening UTC belongs to the next day in winter)", () => {
    assert.equal(pragueDay(new Date("2026-12-05T23:30:00Z")), "2026-12-06");
    const days = dailySummary([
      { status: "paid_cash", total: 300, createdAt: new Date("2026-12-06T08:00:00Z") },
      { status: "paid_bank", total: 250, createdAt: new Date("2026-12-06T09:00:00Z") },
      { status: "unpaid", total: 100, createdAt: new Date("2026-12-05T23:30:00Z") },
      { status: "cancelled", total: 999, createdAt: new Date("2026-12-06T10:00:00Z") },
      { status: "paid_cash", total: 50, createdAt: new Date("2026-12-05T10:00:00Z") },
    ]);
    assert.deepEqual(days, [
      { day: "2026-12-06", count: 3, paidCash: 300, paidBank: 250, unpaid: 100, cancelled: 1 },
      { day: "2026-12-05", count: 1, paidCash: 50, paidBank: 0, unpaid: 0, cancelled: 0 },
    ]);
  });
  it("day range is Prague midnight to midnight", () => {
    assert.deepEqual(pragueDayRange("2026-12-06"), {
      from: new Date("2026-12-05T23:00:00Z"),
      to: new Date("2026-12-06T23:00:00Z"),
    });
    assert.deepEqual(pragueDayRange("2026-07-01"), {
      from: new Date("2026-06-30T22:00:00Z"),
      to: new Date("2026-07-01T22:00:00Z"),
    });
    assert.equal(pragueDayRange("2026-02-30"), null);
    assert.equal(pragueDayRange("dnes"), null);
  });
  it("parses filters defensively", () => {
    assert.deepEqual(parseSaleFilter({ stav: "paid_cash", den: "2026-12-06", kdo: " Eva " }), {
      status: "paid_cash",
      day: "2026-12-06",
      creator: "Eva",
    });
    assert.deepEqual(parseSaleFilter({ stav: "paid" }), { status: "paid", day: null, creator: "" });
    assert.deepEqual(parseSaleFilter({ stav: "x", den: "2026-13-01" }), {
      status: null,
      day: null,
      creator: "",
    });
  });
});

describe("parseSaleItemInput", () => {
  it("normalises name and whole-CZK price", () => {
    assert.deepEqual(
      parseSaleItemInput({ name: "  Dohláška   na místě ", price: "1 300", sortOrder: "" }),
      {
        ok: true,
        name: "Dohláška na místě",
        price: 1300,
        sortOrder: 0,
      },
    );
  });
  it("rejects bad input", () => {
    assert.deepEqual(parseSaleItemInput({ name: "", price: "1", sortOrder: "" }), {
      ok: false,
      error: "name",
    });
    assert.deepEqual(parseSaleItemInput({ name: "x", price: "12.5", sortOrder: "" }), {
      ok: false,
      error: "price",
    });
    assert.deepEqual(parseSaleItemInput({ name: "x", price: "200000", sortOrder: "" }), {
      ok: false,
      error: "price",
    });
    assert.deepEqual(parseSaleItemInput({ name: "x", price: "1", sortOrder: "a" }), {
      ok: false,
      error: "order",
    });
  });
});
