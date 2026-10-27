import { Prisma } from "@prisma/client";

import type { SessionUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";

import {
  buildSaleLines,
  pragueDayRange,
  saleVs,
  SALE_NUMBER_MAX,
  type SaleFilter,
  type SaleItemPrice,
} from "./core";

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

export type CreateSaleResult =
  | { ok: true; id: number; vs: string; total: number }
  | { ok: false; error: "empty" | "quantity" | "item" | "too_many" | "full" | "busy" };

/**
 * Vytvoří prodejku: ceny a názvy jen z ceníku ročníku (nikdy z klienta), pořadí
 * = max + 1 v transakci; souběh dvou pokladen řeší unikát (rok, cislo) + opakování.
 */
export async function createSale(
  session: SessionUser,
  year: number,
  requested: ReadonlyArray<{ itemId: number; quantity: number }>,
): Promise<CreateSaleResult> {
  const items: SaleItemPrice[] = await listSaleItems(year);
  const built = buildSaleLines(requested, items);
  if (!built.ok) return built;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    // Krátké náhodné čekání před opakováním, ať se souběžné pokladny rozestoupí.
    if (attempt > 0) await new Promise((r) => setTimeout(r, 10 + Math.random() * 40 * attempt));
    try {
      return await prisma.$transaction(async (db) => {
        const max = await db.sale.aggregate({ where: { year }, _max: { number: true } });
        const number = (max._max.number ?? 0) + 1;
        if (number > SALE_NUMBER_MAX) return { ok: false as const, error: "full" as const };
        const vs = saleVs(year, number);
        const sale = await db.sale.create({
          data: {
            year,
            number,
            vs,
            total: built.total,
            status: "unpaid",
            createdById: session.id,
            createdByName: actorName(session),
            lines: {
              create: built.lines.map((line) => ({
                itemId: line.itemId,
                name: line.name,
                unitPrice: line.unitPrice,
                quantity: line.quantity,
                lineTotal: line.lineTotal,
              })),
            },
          },
          select: { id: true },
        });
        await writeAudit(
          {
            actor: actor(session),
            action: "sale.created",
            target: `sale:${sale.id}`,
            detail: {
              vs,
              total: built.total,
              lines: built.lines.map((l) => ({
                name: l.name,
                quantity: l.quantity,
                price: l.unitPrice,
              })),
            },
          },
          db,
        );
        return { ok: true as const, id: sale.id, vs, total: built.total };
      });
    } catch (error) {
      // P2002 = obsazené pořadí (souběh), P2034 = konflikt / deadlock transakce → zkusit znovu.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")
      )
        continue;
      throw error;
    }
  }
  return { ok: false, error: "busy" };
}

export type SaleChangeResult = "ok" | "not_found" | "not_unpaid";

/** Nezaplacená → zaplacená hotově / ručně převodem (kdo a kdy), nebo storno. */
export async function changeSaleStatus(
  session: SessionUser,
  id: number,
  to: "paid_cash" | "paid_bank" | "cancelled",
  note?: string,
): Promise<SaleChangeResult> {
  const now = new Date();
  const name = actorName(session);
  return prisma.$transaction(async (db) => {
    const sale = await db.sale.findUnique({
      where: { id },
      select: { id: true, vs: true, total: true },
    });
    if (!sale) return "not_found";
    const data =
      to === "cancelled"
        ? { status: to, cancelledAt: now, cancelledBy: name }
        : { status: to, paidAt: now, paidByName: name, paidById: session.id };
    const changed = await db.sale.updateMany({ where: { id, status: "unpaid" }, data });
    if (changed.count !== 1) return "not_unpaid";
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
        detail: { vs: sale.vs, total: sale.total, ...(note ? { note: note.slice(0, 200) } : {}) },
      },
      db,
    );
    return "ok";
  });
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
    select: { id: true, vs: true, total: true, status: true, createdAt: true, createdByName: true },
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
