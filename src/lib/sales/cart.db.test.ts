/**
 * Integration test of the race-office open cart (#378) against a real MariaDB: several on-site
 * entries (one type O registration) plus merch on one sale, removing one runner, checkout,
 * payment (registration gets only the entry fees), one receipt for the whole sale, cancel and
 * concurrent cash desks. Skipped unless CLUB_MERGE_DB_URL points to a throwaway database (name
 * mcvv_tmp_* or *_test) with all migrations applied. Rows use edition 2093, categories '{' and
 * '}', runners born 1921 named "Košíktest …" and a test user; everything is removed after.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import type { SessionUser } from "@/lib/auth/session";
import { databaseOptions } from "@/lib/db/options";

const url = process.env.CLUB_MERGE_DB_URL;
const throwaway = url ? /\/(mcvv_tmp_\w+|\w+_test)$/.test(new URL(url).pathname) : false;
const skip = !url ? "CLUB_MERGE_DB_URL not set" : !throwaway ? "not a throwaway database" : false;

const YEAR = 2093;
const MEN = "{";
const WOMEN = "}";
const FEE_ADULT = 250;
const USER_EMAIL = "kosik-test@example.test";
const RECEIPT_EMAIL = "kosik-uctenka@example.test";

describe("race office open cart (database)", { skip }, () => {
  let db: PrismaClient;
  let session: SessionUser;
  let itemId: number;
  let cart: typeof import("./cart");
  let onsite: typeof import("./onsite");
  let sales: typeof import("./sales");

  const runner = (lastName: string, bib: number, sex: "M" | "F" = "M") => ({
    firstName: "Jan",
    lastName: `Košíktest ${lastName}`,
    birthYear: 1921,
    sex,
    categoryId: sex === "M" ? MEN : WOMEN,
    clubName: "",
    nationality: "CZ" as const,
    bib,
    bibAuto: false,
    email: "",
    receiptEmail: "",
    receiptLocale: "",
  });

  before(async () => {
    db = new PrismaClient({
      adapter: new PrismaMariaDb(databaseOptions({ DATABASE_URL: url, NODE_ENV: "test" })),
    });
    globalThis.prisma = db;
    cart = await import("./cart");
    onsite = await import("./onsite");
    sales = await import("./sales");
    await cleanup();
    const user = await db.user.create({
      data: { email: USER_EMAIL, name: "Kancelář Test", role: "race_office", passwordHash: "x" },
    });
    session = { id: user.id, email: user.email, name: user.name, role: user.role };
    await db.category.createMany({
      data: [
        {
          id: MEN,
          name: "K muži",
          age: 0,
          sort: 96,
          sex: "M",
          record: 0,
          entryFee: 999,
          bibFrom: 700,
          bibTo: 799,
        },
        {
          id: WOMEN,
          name: "K ženy",
          age: 0,
          sort: 97,
          sex: "F",
          record: 0,
          entryFee: 999,
          bibFrom: 800,
          bibTo: 899,
        },
      ],
    });
    await db.categoryMeta.createMany({
      data: [
        { categoryId: MEN, feeGroup: "dospeli" },
        { categoryId: WOMEN, feeGroup: "dospeli" },
      ],
    });
    await db.registrationSlot.create({
      data: {
        year: YEAR,
        type: "onsite",
        from: new Date(`${YEAR}-12-06T07:00:00Z`),
        to: new Date(`${YEAR}-12-06T10:00:00Z`),
        feeAdult: FEE_ADULT,
        feeYouth: 150,
      },
    });
    const item = await db.saleItem.create({ data: { year: YEAR, name: "Čelenka", price: 100 } });
    itemId = item.id;
  });

  after(async () => {
    if (!db) return;
    await cleanup();
    await db.$disconnect();
  });

  async function cleanup() {
    const user = await db.user.findUnique({ where: { email: USER_EMAIL }, select: { id: true } });
    if (user) await db.auditLog.deleteMany({ where: { actorUserId: user.id } });
    await db.mailQueue.deleteMany({ where: { toEmail: RECEIPT_EMAIL } });
    await db.payment.deleteMany({ where: { year: YEAR } });
    await db.sale.deleteMany({ where: { year: YEAR } });
    await db.saleItem.deleteMany({ where: { year: YEAR } });
    await db.startLineMeta.deleteMany({ where: { year: YEAR } });
    await db.registrationLine.deleteMany({ where: { year: YEAR } });
    await db.registrationMeta.deleteMany({ where: { year: YEAR } });
    await db.registration.deleteMany({ where: { year: YEAR } });
    await db.registrationSlot.deleteMany({ where: { year: YEAR } });
    await db.runner.deleteMany({ where: { name: { startsWith: "Košíktest" } } });
    await db.club.deleteMany({ where: { year: YEAR } });
    await db.categoryMeta.deleteMany({ where: { categoryId: { in: [MEN, WOMEN] } } });
    await db.category.deleteMany({ where: { id: { in: [MEN, WOMEN] } } });
    await db.user.deleteMany({ where: { email: USER_EMAIL } });
  }

  async function add(lastName: string, bib: number, saleId: number | null, sex: "M" | "F" = "M") {
    const result = await onsite.addOnsiteRunnerToCart(
      session,
      YEAR,
      runner(lastName, bib, sex),
      saleId,
    );
    assert.ok(result.ok, JSON.stringify(result));
    return result;
  }

  it("several runners and merch on one sale; payment counts only entry fees", async () => {
    const first = await add("Otec", 701, null);
    assert.equal(first.created, true);
    const second = await add("Matka", 801, first.saleId, "F");
    const third = await add("Syn", 702, first.saleId);
    assert.equal(second.saleId, first.saleId);
    assert.equal(second.registrationId, first.registrationId, "one type O registration");
    assert.equal(third.created, false);
    const merch = await cart.addMerchToCart(session, YEAR, [{ itemId, quantity: 2 }], first.saleId);
    assert.ok(merch.ok);
    const again = await cart.addMerchToCart(session, YEAR, [{ itemId, quantity: 1 }], first.saleId);
    assert.ok(again.ok);
    assert.equal(again.total, 3 * FEE_ADULT + 300);

    const registration = await db.registration.findUnique({
      where: { year_id: { year: YEAR, id: first.registrationId } },
      include: { lines: true },
    });
    assert.equal(registration?.type, "O");
    assert.equal(registration?.lines.length, 3);
    assert.deepEqual(registration!.lines.map((l) => l.bib).sort(), [701, 702, 801]);
    assert.equal(await db.startLineMeta.count({ where: { year: YEAR, locked: true } }), 3);

    // Odebrání jednoho běžce uvolní jen jeho číslo; ostatní řádky zůstanou.
    const open = await cart.findOpenCart(session, YEAR);
    assert.equal(open?.id, first.saleId);
    const sonLine = open!.lines.find((line) => line.entry && line.name.includes("Syn"))!;
    const merchLine = open!.lines.find((line) => line.itemId === itemId)!;
    assert.equal(merchLine.quantity, 3, "same item merged into one line");
    const removed = await cart.changeCartLine(session, first.saleId, sonLine.id, "remove");
    assert.deepEqual(removed, { ok: true, total: 2 * FEE_ADULT + 300, released: 702 });
    assert.equal(await db.registrationLine.count({ where: { year: YEAR, bib: 702 } }), 0);
    assert.equal(
      await db.registrationLine.count({
        where: { year: YEAR, registrationId: first.registrationId },
      }),
      2,
    );
    const dec = await cart.changeCartLine(session, first.saleId, merchLine.id, "dec");
    assert.ok(dec.ok);
    assert.equal(dec.total, 2 * FEE_ADULT + 200);
    // Číslo 702 je zase volné pro jinou pokladnu.
    const other = await add("Soused", 702, null);
    assert.notEqual(other.saleId, first.saleId);

    // Otevřenou prodejku nejde zaplatit, jen uzavřít k platbě.
    assert.equal(
      await sales.applySaleStatusChange(session, first.saleId, "paid_cash"),
      "not_closed",
    );
    const checkout = await cart.closeCartForPayment(session, first.saleId, {
      email: RECEIPT_EMAIL,
    });
    assert.deepEqual(checkout, { ok: true, saleId: first.saleId, total: 2 * FEE_ADULT + 200 });
    const closedAdd = await onsite.addOnsiteRunnerToCart(
      session,
      YEAR,
      runner("Pozdě", 703),
      first.saleId,
    );
    assert.deepEqual(closedAdd, { ok: false, error: "cart_closed" });
    assert.equal(await sales.applySaleStatusChange(session, first.saleId, "paid_cash"), "ok");

    const payments = await db.payment.findMany({ where: { year: YEAR } });
    assert.equal(payments.length, 1);
    assert.equal(payments[0].amount, 2 * FEE_ADULT, "merch is not part of the entry payment");
    const paidAudit = await db.auditLog.findFirst({
      where: { action: "payment.created", actorUserId: session.id },
    });
    assert.equal((paidAudit?.detail as { merch?: number }).merch, 200);
    const status = await db.registration.findUnique({
      where: { year_id: { year: YEAR, id: first.registrationId } },
      select: { status: true },
    });
    const { ENTRY_STATUS } = await import("@/lib/entries/status");
    assert.equal(status?.status, ENTRY_STATUS.paid);

    // Jedna účtenka za celou prodejku (do fronty, nic se neodesílá).
    assert.equal(await sales.sendSaleReceipt(session, first.saleId), "ok");
    const mails = await db.mailQueue.findMany({ where: { toEmail: RECEIPT_EMAIL } });
    assert.equal(mails.length, 1);
    assert.match(mails[0].text, /Otec/);
    assert.match(mails[0].text, /Matka/);
    assert.match(mails[0].text, /Čelenka/);
    assert.doesNotMatch(mails[0].text, /Syn/);
  });

  it("cancel of an open cart releases every bib and cancels the registration", async () => {
    const a = await add("Storno A", 710, null);
    await add("Storno B", 711, a.saleId);
    await cart.addMerchToCart(session, YEAR, [{ itemId, quantity: 1 }], a.saleId);
    assert.equal(await sales.applySaleStatusChange(session, a.saleId, "cancelled"), "ok");
    assert.equal(
      await db.registrationLine.count({ where: { year: YEAR, bib: { in: [710, 711] } } }),
      0,
    );
    const { ENTRY_STATUS } = await import("@/lib/entries/status");
    const reg = await db.registration.findUnique({
      where: { year_id: { year: YEAR, id: a.registrationId } },
      select: { status: true },
    });
    assert.equal(reg?.status, ENTRY_STATUS.cancelled);
    const audit = await db.auditLog.findFirst({
      where: { action: "sale.cancelled", target: `sale:${a.saleId}` },
    });
    const released = (audit?.detail as { onsite?: { released?: { bib: number }[] } }).onsite
      ?.released;
    assert.deepEqual(released?.map((row) => row.bib).sort(), [710, 711]);
    assert.equal(
      await db.payment.count({ where: { year: YEAR, registrationId: String(a.registrationId) } }),
      0,
    );
  });

  it("removing the last runner cancels the registration but keeps the merch", async () => {
    const m = await cart.addMerchToCart(session, YEAR, [{ itemId, quantity: 1 }], null);
    assert.ok(m.ok);
    const r = await add("Sám", 720, m.saleId);
    const sale = await db.sale.findUnique({ where: { id: m.saleId }, include: { lines: true } });
    const line = sale!.lines.find((row) => row.entry)!;
    const removed = await cart.changeCartLine(session, m.saleId, line.id, "remove");
    assert.deepEqual(removed, { ok: true, total: 100, released: 720 });
    const after = await db.sale.findUnique({ where: { id: m.saleId } });
    assert.equal(after?.registrationId, null);
    const { ENTRY_STATUS } = await import("@/lib/entries/status");
    const reg = await db.registration.findUnique({
      where: { year_id: { year: YEAR, id: r.registrationId } },
      select: { status: true },
    });
    assert.equal(reg?.status, ENTRY_STATUS.cancelled);
    // Merch-only prodejka: zaplacení nevytvoří platbu přihlášky.
    assert.ok((await cart.closeCartForPayment(session, m.saleId)).ok);
    assert.equal(await sales.applySaleStatusChange(session, m.saleId, "paid_cash"), "ok");
    assert.equal(
      await db.payment.count({ where: { year: YEAR, registrationId: String(r.registrationId) } }),
      0,
    );
  });

  it("single runner sale keeps the old behaviour (payment = whole sale)", async () => {
    const r = await add("Jediný", 730, null);
    assert.ok((await cart.closeCartForPayment(session, r.saleId)).ok);
    // Zpět do košíku a znovu k platbě (zákazník si to rozmyslel).
    assert.equal(await cart.reopenCart(session, r.saleId), "ok");
    assert.equal(await sales.applySaleStatusChange(session, r.saleId, "paid_cash"), "not_closed");
    assert.ok((await cart.closeCartForPayment(session, r.saleId)).ok);
    assert.equal(await sales.applySaleStatusChange(session, r.saleId, "paid_cash"), "ok");
    const sale = await db.sale.findUnique({ where: { id: r.saleId } });
    const payment = await db.payment.findFirst({
      where: { year: YEAR, registrationId: String(r.registrationId) },
    });
    assert.equal(sale?.total, FEE_ADULT);
    assert.equal(payment?.amount, FEE_ADULT);
    assert.equal(await cart.reopenCart(session, r.saleId), "not_unpaid");
  });

  it("two cash desks never reserve the same bib", async () => {
    const settled = await Promise.allSettled([
      onsite.addOnsiteRunnerToCart(session, YEAR, runner("Souběh X", 740), null),
      onsite.addOnsiteRunnerToCart(session, YEAR, runner("Souběh Y", 740), null),
    ]);
    assert.deepEqual(
      settled.filter((s) => s.status === "rejected"),
      [],
      "a concurrent new runner must not fail",
    );
    const [x, y] = settled.map(
      (s) =>
        (s as PromiseFulfilledResult<Awaited<ReturnType<typeof onsite.addOnsiteRunnerToCart>>>)
          .value,
    );
    const ok = [x, y].filter((r) => r.ok);
    const taken = [x, y].filter((r) => !r.ok && r.error === "bib_taken");
    assert.equal(ok.length, 1, JSON.stringify([x, y]));
    assert.equal(taken.length, 1);
    assert.equal(await db.registrationLine.count({ where: { year: YEAR, bib: 740 } }), 1);
  });
});
