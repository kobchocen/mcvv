import { Prisma } from "@prisma/client";

import { startLineTarget } from "@/lib/audit/startlist";
import { writeAudit } from "@/lib/audit/log";
import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { isRetryableTxError, withTxRetry } from "@/lib/db/tx-retry";
import { entryTarget } from "@/lib/entries/changes-core";
import { normalizeEmail } from "@/lib/newsletter/core";
import { BIB_LOCK } from "@/lib/slots/late-paid";

import {
  cartLineChange,
  cartTotals,
  planMerchMerge,
  saleLinesTotal,
  type CartLineOp,
} from "./cart-core";
import { buildSaleLines, saleVs, SALE_NUMBER_MAX, type SaleItemPrice } from "./core";
import { releaseOnsiteRunnerInTx } from "./onsite";
import { receiptLocale } from "./receipt-mail";

/**
 * Kancelář – otevřený košík (#378): rozpracovaná prodejka, do které obsluha přidává dohlášky
 * (`addOnsiteRunnerToCart` v onsite.ts) a položky ceníku, upravuje je a nakonec ji uzavře
 * „K platbě“. Oprávnění ověřují volající (server actions); tady jen data a audit.
 */

type Tx = Prisma.TransactionClient;

function actorName(session: SessionUser): string {
  return (session.name?.trim() || session.email).slice(0, 80);
}

function actor(session: SessionUser) {
  return { id: session.id, email: session.email, role: session.role };
}

/**
 * Košík pro pokladnu: zadaná prodejka (?prodejka=), pokud je ještě otevřená, jinak poslední
 * rozpracovaná prodejka této pokladny (přihlášeného účtu) – přežije obnovení stránky.
 */
export async function findOpenCart(session: SessionUser, year: number, preferId?: number | null) {
  const include = { lines: { orderBy: { id: "asc" as const } } };
  if (preferId) {
    const sale = await prisma.sale.findUnique({ where: { id: preferId }, include });
    if (sale && sale.year === year && sale.status === "unpaid" && sale.checkoutAt == null) {
      return sale;
    }
  }
  return prisma.sale.findFirst({
    where: { year, status: "unpaid", checkoutAt: null, createdById: session.id },
    orderBy: { id: "desc" },
    include,
  });
}

/** Zamkne řádek prodejky a vrátí ji, jen když je to otevřený košík ročníku. */
async function lockOpenCart(tx: Tx, saleId: number, year?: number) {
  await tx.$queryRaw`SELECT id FROM mcvv_sale WHERE id = ${saleId} FOR UPDATE`;
  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    include: { lines: { orderBy: { id: "asc" } } },
  });
  if (!sale || sale.status !== "unpaid" || sale.checkoutAt != null) return null;
  if (year != null && sale.year !== year) return null;
  return sale;
}

async function refreshTotal(tx: Tx, saleId: number): Promise<number> {
  const lines = await tx.saleLine.findMany({ where: { saleId }, select: { lineTotal: true } });
  const total = saleLinesTotal(lines);
  await tx.sale.update({ where: { id: saleId }, data: { total } });
  return total;
}

export type AddMerchResult =
  | { ok: true; saleId: number; vs: string; total: number; created: boolean }
  | {
      ok: false;
      error: "empty" | "quantity" | "item" | "too_many" | "full" | "busy" | "cart_closed";
    };

/**
 * Položky ceníku do košíku `saleId` (null = nový košík). Ceny a názvy jen z ceníku ročníku
 * (nikdy z klienta). Stejná položka za stejnou cenu se přičte k existujícímu řádku.
 */
export async function addMerchToCart(
  session: SessionUser,
  year: number,
  requested: ReadonlyArray<{ itemId: number; quantity: number }>,
  saleId: number | null,
): Promise<AddMerchResult> {
  const items: SaleItemPrice[] = await prisma.saleItem.findMany({ where: { year } });
  const built = buildSaleLines(requested, items);
  if (!built.ok) return built;
  try {
    return await withTxRetry(
      () =>
        prisma.$transaction(async (tx) => {
          if (saleId == null) {
            const max = await tx.sale.aggregate({ where: { year }, _max: { number: true } });
            const number = (max._max.number ?? 0) + 1;
            if (number > SALE_NUMBER_MAX) return { ok: false as const, error: "full" as const };
            const vs = saleVs(year, number);
            const sale = await tx.sale.create({
              data: {
                year,
                number,
                vs,
                total: built.total,
                status: "unpaid",
                createdById: session.id,
                createdByName: actorName(session),
                checkoutAt: null,
                lines: { create: built.lines },
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
                  open: true,
                  lines: built.lines.map((l) => ({
                    name: l.name,
                    quantity: l.quantity,
                    price: l.unitPrice,
                  })),
                },
              },
              tx,
            );
            return { ok: true as const, saleId: sale.id, vs, total: built.total, created: true };
          }
          const cart = await lockOpenCart(tx, saleId, year);
          if (!cart) return { ok: false as const, error: "cart_closed" as const };
          const plan = planMerchMerge(cart.lines, built.lines);
          if (!plan.ok) return plan;
          for (const row of plan.update) {
            await tx.saleLine.update({
              where: { id: row.id },
              data: { quantity: row.quantity, lineTotal: row.lineTotal },
            });
          }
          if (plan.create.length > 0) {
            await tx.saleLine.createMany({
              data: plan.create.map((line) => ({ saleId: cart.id, ...line })),
            });
          }
          const total = await refreshTotal(tx, cart.id);
          await writeAudit(
            {
              actor: actor(session),
              action: "sale.line_added",
              target: `sale:${cart.id}`,
              detail: {
                vs: cart.vs,
                total,
                lines: built.lines.map((l) => ({
                  name: l.name,
                  quantity: l.quantity,
                  price: l.unitPrice,
                })),
              },
            },
            tx,
          );
          return { ok: true as const, saleId: cart.id, vs: cart.vs, total, created: false };
        }),
      { attempts: 8 },
    );
  } catch (error) {
    if (isRetryableTxError(error)) return { ok: false, error: "busy" };
    throw error;
  }
}

export type CartLineResult =
  | { ok: true; total: number; released: number | null }
  | { ok: false; error: "cart_closed" | "not_found" | "quantity" | "busy" };

/**
 * Úprava řádku otevřeného košíku: merch +/− kus nebo odebrání, dohláška jen odebrání celého
 * běžce (uvolní jen jeho číslo, ostatní položky zůstanou). Pod zámkem čísel jako přidání.
 */
export async function changeCartLine(
  session: SessionUser,
  saleId: number,
  lineId: number,
  op: CartLineOp,
): Promise<CartLineResult> {
  try {
    return await withTxRetry(
      () =>
        prisma.$transaction(
          async (tx) => {
            const lock = await tx.$queryRaw<{ ok: bigint | number | null }[]>`
            SELECT GET_LOCK(${BIB_LOCK}, 10) AS ok`;
            if (Number(lock[0]?.ok ?? 0) !== 1)
              return { ok: false as const, error: "busy" as const };
            try {
              return await changeLineInTx(tx, session, saleId, lineId, op);
            } finally {
              await tx.$queryRaw`SELECT RELEASE_LOCK(${BIB_LOCK})`;
            }
          },
          { timeout: 20_000 },
        ),
      { attempts: 8 },
    );
  } catch (error) {
    if (isRetryableTxError(error)) return { ok: false, error: "busy" };
    throw error;
  }
}

async function changeLineInTx(
  tx: Tx,
  session: SessionUser,
  saleId: number,
  lineId: number,
  op: CartLineOp,
): Promise<CartLineResult> {
  const cart = await lockOpenCart(tx, saleId);
  if (!cart) return { ok: false, error: "cart_closed" };
  const line = cart.lines.find((row) => row.id === lineId);
  if (!line) return { ok: false, error: "not_found" };
  const change = cartLineChange(line, op);
  if (!change.ok) return change;

  if (line.entry) {
    let released: number | null = null;
    let runnerId: string | null = null;
    if (cart.registrationId != null) {
      const result = await releaseOnsiteRunnerInTx(tx, cart.year, cart.registrationId, line.id);
      released = result.released?.bib ?? null;
      runnerId = result.released?.runnerId ?? null;
      if (result.released) {
        await writeAudit(
          {
            actor: actor(session),
            action: "startlist.bib_set",
            target: startLineTarget(cart.year, result.released.runnerId),
            detail: {
              changes: {
                bib: { from: result.released.bib, to: null },
                locked: { from: true, to: false },
              },
              auto: "onsite_removed",
              registrationId: cart.registrationId,
              saleId: cart.id,
            },
          },
          tx,
        );
      }
      if (result.remaining === 0) {
        // Poslední běžec košíku: přihláška zrušena, košík zůstává (merch), bez vazby na přihlášku.
        await tx.sale.update({ where: { id: cart.id }, data: { registrationId: null } });
        await writeAudit(
          {
            actor: actor(session),
            action: "entry.cancelled",
            target: entryTarget(cart.year, cart.registrationId),
            detail: { reason: "onsite_cart_emptied", saleId: cart.id, vs: cart.vs },
          },
          tx,
        );
      }
    }
    await tx.saleLine.delete({ where: { id: line.id } });
    const total = await refreshTotal(tx, cart.id);
    await writeAudit(
      {
        actor: actor(session),
        action: "sale.line_removed",
        target: `sale:${cart.id}`,
        detail: {
          vs: cart.vs,
          lineId: line.id,
          name: line.name,
          lineTotal: line.lineTotal,
          runnerId,
          bib: released,
          total,
        },
      },
      tx,
    );
    return { ok: true, total, released };
  }

  if (change.quantity === 0) await tx.saleLine.delete({ where: { id: line.id } });
  else {
    await tx.saleLine.update({
      where: { id: line.id },
      data: { quantity: change.quantity, lineTotal: change.quantity * line.unitPrice },
    });
  }
  const total = await refreshTotal(tx, cart.id);
  await writeAudit(
    {
      actor: actor(session),
      action: change.quantity === 0 ? "sale.line_removed" : "sale.line_changed",
      target: `sale:${cart.id}`,
      detail: {
        vs: cart.vs,
        lineId: line.id,
        name: line.name,
        quantity: { from: line.quantity, to: change.quantity },
        total,
      },
    },
    tx,
  );
  return { ok: true, total, released: null };
}

export type CheckoutResult =
  | { ok: true; saleId: number; total: number }
  | { ok: false; error: "cart_closed" | "empty" | "invalid_email" };

/**
 * „K platbě“: uzavře košík (nastaví `checkoutAt`), přepočte součet a uloží e-mail a jazyk
 * účtenky. Teprve pak detail prodejky ukáže QR a tlačítka platby.
 */
export async function closeCartForPayment(
  session: SessionUser,
  saleId: number,
  receipt: { email?: string | null; locale?: string | null } = {},
): Promise<CheckoutResult> {
  const typed = receipt.email?.trim() ?? "";
  const email = typed ? normalizeEmail(typed) : null;
  if (typed && !email) return { ok: false, error: "invalid_email" };
  return prisma.$transaction(async (tx) => {
    const cart = await lockOpenCart(tx, saleId);
    if (!cart) return { ok: false as const, error: "cart_closed" as const };
    if (cart.lines.length === 0) return { ok: false as const, error: "empty" as const };
    const totals = cartTotals(cart.lines);
    const now = new Date();
    await tx.sale.update({
      where: { id: cart.id },
      data: {
        checkoutAt: now,
        total: totals.total,
        email,
        locale: email ? receiptLocale(receipt.locale) : null,
      },
    });
    await writeAudit(
      {
        actor: actor(session),
        action: "sale.checkout",
        target: `sale:${cart.id}`,
        detail: {
          vs: cart.vs,
          total: totals.total,
          entries: totals.entries,
          merch: totals.merch,
          runners: totals.runners,
          lines: cart.lines.length,
        },
      },
      tx,
    );
    return { ok: true as const, saleId: cart.id, total: totals.total };
  });
}

/**
 * Zpět do košíku: nezaplacená prodejka uzavřená k platbě se znovu otevře pro úpravy (QR
 * a platba se skryjí). Zaplacenou nebo stornovanou prodejku znovu otevřít nejde.
 */
export async function reopenCart(
  session: SessionUser,
  saleId: number,
): Promise<"ok" | "not_unpaid"> {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.sale.updateMany({
      where: { id: saleId, status: "unpaid", checkoutAt: { not: null } },
      data: { checkoutAt: null },
    });
    if (changed.count !== 1) return "not_unpaid" as const;
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      select: { vs: true, total: true },
    });
    await writeAudit(
      {
        actor: actor(session),
        action: "sale.reopened",
        target: `sale:${saleId}`,
        detail: { vs: sale?.vs, total: sale?.total },
      },
      tx,
    );
    return "ok" as const;
  });
}
