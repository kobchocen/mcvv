import { Prisma } from "@prisma/client";

import { canAccess } from "@/lib/admin/access";
import { saleStatusSection } from "@/lib/sales/guard";
import type { SessionUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { entryTarget } from "@/lib/entries/changes-core";
import { recalculateRegistrationStatus } from "@/lib/entries/status";
import { BANK_ACCOUNT } from "@/lib/entries/spd";
import { enqueueMail } from "@/lib/mail/queue";
import { normalizeEmail } from "@/lib/newsletter/core";
import { siteUrl } from "@/lib/site/url";

import { receiptLocale, renderSaleReceipt } from "./receipt-mail";

import { pragueDayRange, type SaleFilter } from "./core";
import { payOnsiteRegistrationInTx, releaseOnsiteRegistrationInTx } from "./onsite";

/**
 * Závodní kancelář (#207) – práce s DB. Oprávnění ověřují volající (stránky a server
 * actions); tady jen datové operace a audit.
 */

function actorName(session: SessionUser): string {
  return (session.name?.trim() || session.email).slice(0, 80);
}

function actor(session: SessionUser) {
  return { id: session.id, email: session.email, role: session.role };
}

export async function listSaleItems(year: number, options: { activeOnly?: boolean } = {}) {
  return prisma.saleItem.findMany({
    where: { year, ...(options.activeOnly ? { active: true } : {}) },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

export type SaleChangeResult = "ok" | "forbidden" | "not_found" | "not_unpaid" | "not_closed";

/**
 * Nezaplacená → zaplacená hotově / ručně převodem (kdo a kdy), nebo storno. Zaplatit jde jen
 * prodejku uzavřenou k platbě (#378); otevřený košík jde jen stornovat.
 */
export async function changeSaleStatus(
  session: SessionUser,
  id: number,
  to: "paid_cash" | "paid_bank" | "cancelled",
  note?: string,
): Promise<SaleChangeResult> {
  // Pojistka i mimo server action: ruční převod jen admin (#207).
  if (!(await canAccess(saleStatusSection(to), "write"))) return "forbidden";
  return applySaleStatusChange(session, id, to, note);
}

/**
 * Změna stavu prodejky bez kontroly oprávnění (volá ji `changeSaleStatus` po ověření práva;
 * samostatně jen pro testy proti DB).
 */
export async function applySaleStatusChange(
  session: SessionUser,
  id: number,
  to: "paid_cash" | "paid_bank" | "cancelled",
  note?: string,
): Promise<Exclude<SaleChangeResult, "forbidden">> {
  const now = new Date();
  const name = actorName(session);
  const result = await prisma.$transaction(async (db) => {
    const sale = await db.sale.findUnique({
      where: { id },
      select: {
        id: true,
        year: true,
        vs: true,
        total: true,
        status: true,
        checkoutAt: true,
        registrationId: true,
      },
    });
    if (!sale) return { status: "not_found" as const };
    if (to !== "cancelled" && sale.status === "unpaid" && sale.checkoutAt == null) {
      return { status: "not_closed" as const };
    }
    const data =
      to === "cancelled"
        ? { status: to, cancelledAt: now, cancelledBy: name }
        : { status: to, paidAt: now, paidByName: name, paidById: session.id };
    // Podmíněný zápis: platit jen uzavřenou prodejku (souběh s „Zpět do košíku“).
    const changed = await db.sale.updateMany({
      where: { id, status: "unpaid", ...(to === "cancelled" ? {} : { checkoutAt: { not: null } }) },
      data,
    });
    if (changed.count !== 1) return { status: "not_unpaid" as const };
    // Dohláška na místě (#222): platba přihlášky, nebo storno přihlášky a uvolnění čísla.
    let onsite: Prisma.InputJsonValue | undefined;
    if (sale.registrationId != null) {
      if (to === "cancelled") {
        const released = await releaseOnsiteRegistrationInTx(db, sale.year, sale.registrationId);
        onsite = { registrationId: sale.registrationId, released };
        await writeAudit(
          {
            actor: actor(session),
            action: "entry.cancelled",
            target: entryTarget(sale.year, sale.registrationId),
            detail: { reason: "onsite_sale_cancelled", saleId: id, vs: sale.vs, released },
          },
          db,
        );
      } else {
        // Platba přihlášky jen ve výši startovného (řádky dohlášek), merch zůstává jen v prodejce.
        const payment = await payOnsiteRegistrationInTx(db, sale, now);
        const paymentId = payment?.paymentId ?? null;
        const amount = payment?.amount ?? 0;
        onsite = { registrationId: sale.registrationId, paymentId, amount };
        await writeAudit(
          {
            actor: actor(session),
            action: "payment.created",
            target: entryTarget(sale.year, sale.registrationId),
            detail: {
              paymentId,
              amount,
              merch: sale.total - amount,
              saleTotal: sale.total,
              saleId: id,
              vs: sale.vs,
              source: to,
            },
          },
          db,
        );
      }
    }
    await writeAudit(
      {
        actor: actor(session),
        action:
          to === "paid_cash"
            ? "sale.paid_cash"
            : to === "paid_bank"
              ? "sale.paid_bank_manual"
              : "sale.cancelled",
        target: `sale:${id}`,
        detail: {
          vs: sale.vs,
          total: sale.total,
          ...(note ? { note: note.slice(0, 200) } : {}),
          ...(onsite ? { onsite } : {}),
        },
      },
      db,
    );
    return { status: "ok" as const, year: sale.year, registrationId: sale.registrationId };
  });
  if (result.status === "ok" && result.registrationId != null && to !== "cancelled") {
    await recalculateRegistrationStatus(result.year, result.registrationId);
  }
  return result.status;
}

export async function getSale(id: number) {
  return prisma.sale.findUnique({
    where: { id },
    include: { lines: { orderBy: { id: "asc" } } },
  });
}

export async function listSales(year: number, filter: SaleFilter, take = 300) {
  const range = filter.day ? pragueDayRange(filter.day) : null;
  const where: Prisma.SaleWhereInput = {
    year,
    ...(filter.status === "paid"
      ? { status: { in: ["paid_bank", "paid_cash"] } }
      : filter.status
        ? { status: filter.status }
        : {}),
    ...(range ? { createdAt: { gte: range.from, lt: range.to } } : {}),
    ...(filter.creator ? { createdByName: filter.creator } : {}),
  };
  const [rows, all, creators] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { id: "desc" },
      take,
      include: { lines: { orderBy: { id: "asc" } } },
    }),
    // Denní součty z celého ročníku (bez filtru), ať přehled sedí s pokladnou.
    prisma.sale.findMany({
      where: { year },
      select: { status: true, total: true, createdAt: true },
    }),
    prisma.sale.findMany({
      where: { year },
      distinct: ["createdByName"],
      select: { createdByName: true },
      orderBy: { createdByName: "asc" },
    }),
  ]);
  const matching = await prisma.sale.count({ where });
  return { rows, all, creators: creators.map((c) => c.createdByName), matching };
}

/** Posledních pár prodejek pro pokladnu (rychlý návrat na QR). */
export async function recentSales(year: number, take = 8) {
  return prisma.sale.findMany({
    where: { year },
    orderBy: { id: "desc" },
    take,
    select: {
      id: true,
      vs: true,
      total: true,
      status: true,
      checkoutAt: true,
      createdAt: true,
      createdByName: true,
    },
  });
}

export async function createSaleItem(
  session: SessionUser,
  year: number,
  input: { name: string; price: number; sortOrder: number },
) {
  return prisma.$transaction(async (db) => {
    const item = await db.saleItem.create({ data: { year, ...input }, select: { id: true } });
    await writeAudit(
      {
        actor: actor(session),
        action: "sale_item.created",
        target: `sale_item:${item.id}`,
        detail: { year, ...input },
      },
      db,
    );
    return item.id;
  });
}

export async function updateSaleItem(
  session: SessionUser,
  id: number,
  input: { name?: string; price?: number; sortOrder?: number; active?: boolean },
): Promise<boolean> {
  return prisma.$transaction(async (db) => {
    const before = await db.saleItem.findUnique({ where: { id } });
    if (!before) return false;
    await db.saleItem.update({ where: { id }, data: input });
    await writeAudit(
      {
        actor: actor(session),
        action: "sale_item.updated",
        target: `sale_item:${id}`,
        detail: {
          before: {
            name: before.name,
            price: before.price,
            sortOrder: before.sortOrder,
            active: before.active,
          },
          after: input,
        },
      },
      db,
    );
    return true;
  });
}

export type ReceiptResult = "ok" | "not_found" | "invalid_email" | "no_email";

/** E-mail do auditu bez celé adresy (j…@domena.cz). */
function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}…@${domain ?? ""}`;
}

/**
 * Pošle účtenku prodejky e-mailem přes frontu pošty (#223). Bez `email` se použije e-mail
 * uložený u prodejky; zadaný e-mail a jazyk se k prodejce uloží. Obsah: položky, kusy, ceny,
 * celkem, způsob a stav platby, VS – v jazyce prodejky (výchozí cs).
 */
export async function sendSaleReceipt(
  session: SessionUser,
  id: number,
  input: { email?: string | null; locale?: string | null } = {},
  now = new Date(),
): Promise<ReceiptResult> {
  const sale = await getSale(id);
  if (!sale) return "not_found";
  const typed = input.email?.trim() ? normalizeEmail(input.email) : null;
  if (input.email?.trim() && !typed) return "invalid_email";
  const email = typed ?? sale.email;
  if (!email) return "no_email";
  const locale = receiptLocale(input.locale ?? sale.locale);
  const mail = renderSaleReceipt({
    sale,
    locale,
    site: siteUrl(),
    account: `${BANK_ACCOUNT} (Fio)`,
  });
  await enqueueMail({
    ...mail,
    to: email,
    kind: "other",
    dedupeKey: `sale-receipt:${sale.id}:${sale.status}:${email}:${now.getTime()}`,
  });
  await prisma.$transaction(async (db) => {
    await db.sale.update({
      where: { id: sale.id },
      data: { email, locale, receiptSentAt: now },
    });
    await writeAudit(
      {
        actor: actor(session),
        action: "sale.receipt_sent",
        target: `sale:${sale.id}`,
        detail: { vs: sale.vs, to: maskEmail(email), locale, status: sale.status },
      },
      db,
    );
  });
  return "ok";
}
