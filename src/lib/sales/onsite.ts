import { Prisma } from "@prisma/client";

import { toPaymentRegistrationId } from "@/lib/admin/parse";
import { startLineTarget } from "@/lib/audit/startlist";
import { writeAudit } from "@/lib/audit/log";
import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { eligibleCategoriesFor } from "@/lib/entries/category";
import { resolveClub } from "@/lib/entries/club";
import { nextRegistrationId } from "@/lib/entries/ensure-core";
import { resolveRunner } from "@/lib/entries/runner";
import { ENTRY_STATUS, nextStatus } from "@/lib/entries/status";
import { loadStartSettings } from "@/lib/race/startlist-load";
import { slotFee, slotOf } from "@/lib/slots/core";
import { BIB_LOCK } from "@/lib/slots/late-paid";
import { categoryFeeGroup, loadSlots } from "@/lib/slots/load";

import { saleVs, SALE_NUMBER_MAX } from "./core";
import {
  checkOnsiteBib,
  ONSITE_PAYMENT_AUTHOR,
  ONSITE_SALE_LINE_LABEL,
  onsiteSaleLineName,
  type OnsiteEntryInput,
} from "./onsite-core";

/**
 * Dohláška na místě (#222): prodejka v pokladně založí přihlášku s jedním běžcem, rezervuje
 * ručně zadané startovní číslo (řádek zamčený ve startovce) a prodejku s přihláškou propojí.
 * Zaplacení prodejky = platba přihlášky (mcvv_platba, autor „pokladna“), storno nezaplacené
 * prodejky = zrušení přihlášky a uvolnění čísla i běžce.
 */

type Tx = Prisma.TransactionClient;

export type OnsiteEntryError =
  | "no_slot"
  | "category"
  | "ambiguous"
  | "runner_taken"
  | "bib_taken"
  | "bib_champion"
  | "full"
  | "busy";

export type CreateOnsiteEntryResult =
  | {
      ok: true;
      saleId: number;
      vs: string;
      total: number;
      registrationId: number;
      bib: number;
      outsideCategory: boolean;
    }
  | { ok: false; error: OnsiteEntryError };

function actorName(session: SessionUser): string {
  return (session.name?.trim() || session.email).slice(0, 80);
}

function actor(session: SessionUser) {
  return { id: session.id, email: session.email, role: session.role };
}

/** Ceny termínu „na místě“ pro formulář pokladny (null = ročník termín na místě nemá). */
export async function loadOnsiteEntryOptions(year: number) {
  const [slots, categories, metas] = await Promise.all([
    loadSlots(year),
    prisma.category.findMany({
      orderBy: { sort: "asc" },
      select: { id: true, name: true, sex: true, age: true, entryFee: true },
    }),
    prisma.categoryMeta.findMany(),
  ]);
  const onsite = slotOf(slots, "onsite");
  if (!onsite) return null;
  const groups = new Map(metas.map((meta) => [meta.categoryId, meta.feeGroup]));
  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      sex: category.sex,
      age: category.age,
      fee: slotFee(onsite, groups.get(category.id) ?? null, category.entryFee),
    })),
  };
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export async function createOnsiteEntry(
  session: SessionUser,
  year: number,
  input: OnsiteEntryInput,
): Promise<CreateOnsiteEntryResult> {
  const slot = slotOf(await loadSlots(year), "onsite");
  if (!slot) return { ok: false, error: "no_slot" };
  const categories = await prisma.category.findMany();
  const category = eligibleCategoriesFor(input.birthYear, input.sex, year, categories).find(
    (row) => row.id === input.categoryId,
  );
  if (!category) return { ok: false, error: "category" };
  // Startovné na místě: cena termínu (Q314), bez slev zdarma (ty platí jen v early/standardu, Q301).
  const fee = slotFee(slot, await categoryFeeGroup(category.id), category.entryFee);

  const runner = await resolveRunner({
    firstName: input.firstName,
    lastName: input.lastName,
    birthYear: input.birthYear,
    sex: input.sex,
    nationality: input.nationality,
  });
  if ("error" in runner) return { ok: false, error: "ambiguous" };
  const already = await prisma.registrationLine.findFirst({
    where: { year, runnerId: runner.id },
    select: { runnerId: true },
  });
  if (already) return { ok: false, error: "runner_taken" };
  const [club, settings] = await Promise.all([
    resolveClub(input.clubName, year),
    loadStartSettings(year),
  ]);
  const range = settings.ranges.find((row) => row.categoryId === category.id) ?? null;
  const champions = [settings.champions.men, settings.champions.women];
  const author = actorName(session);
  const email = input.email ? input.email.toLowerCase() : null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 10 + Math.random() * 40 * attempt));
    try {
      return await prisma.$transaction(
        async (tx) => {
          const lock = await tx.$queryRaw<{ ok: bigint | number | null }[]>`
            SELECT GET_LOCK(${BIB_LOCK}, 10) AS ok`;
          if (Number(lock[0]?.ok ?? 0) !== 1) return { ok: false as const, error: "busy" as const };
          try {
            return await createInTx(tx, {
              session,
              year,
              author,
              email,
              runner,
              club,
              category,
              fee,
              slot,
              bib: input.bib,
              range,
              champions,
            });
          } finally {
            await tx.$queryRaw`SELECT RELEASE_LOCK(${BIB_LOCK})`;
          }
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      if (isRetryable(error)) continue;
      throw error;
    }
  }
  return { ok: false, error: "busy" };
}

async function createInTx(
  tx: Tx,
  ctx: {
    session: SessionUser;
    year: number;
    author: string;
    email: string | null;
    runner: { id: string; name: string; created: boolean };
    club: { id: string; name: string; created: boolean };
    category: { id: string; name: string };
    fee: number;
    slot: { feeAdult: number; feeYouth: number };
    bib: number;
    range: { bibFrom: number; bibTo: number } | null;
    champions: (number | null)[];
  },
): Promise<CreateOnsiteEntryResult> {
  const { year, runner, bib } = ctx;
  // Souběh: běžec mohl být mezitím přihlášen jinou pokladnou nebo z webu.
  const again = await tx.registrationLine.findFirst({
    where: { year, runnerId: runner.id },
    select: { runnerId: true },
  });
  if (again) return { ok: false, error: "runner_taken" };
  const [lines, imported] = await Promise.all([
    tx.registrationLine.findMany({ where: { year, bib: { gt: 0 } }, select: { bib: true } }),
    tx.startEntry.findMany({ where: { year, bib: { gt: 0 } }, select: { bib: true } }),
  ]);
  const taken = new Set<number>([...lines.map((l) => l.bib!), ...imported.map((r) => r.bib)]);
  const check = checkOnsiteBib(bib, taken, ctx.champions, ctx.range);
  if (!check.ok) return check;

  const maxSale = await tx.sale.aggregate({ where: { year }, _max: { number: true } });
  const saleNumber = (maxSale._max.number ?? 0) + 1;
  if (saleNumber > SALE_NUMBER_MAX) return { ok: false, error: "full" };
  const vs = saleVs(year, saleNumber);

  const maxReg = await tx.registration.aggregate({ where: { year }, _max: { id: true } });
  const id = nextRegistrationId(maxReg._max.id);
  const now = new Date();
  await tx.registration.create({
    data: {
      year,
      id,
      email: ctx.email,
      name: runner.name.slice(0, 128),
      type: "O",
      status: nextStatus(ENTRY_STATUS.empty, 1, ctx.fee, 0),
      author: ctx.author.slice(0, 64),
      created: now,
      note: `Dohláška na místě, prodejka ${vs}`,
    },
  });
  const meta = {
    slot: "onsite" as const,
    feeAdult: ctx.slot.feeAdult,
    feeYouth: ctx.slot.feeYouth,
  };
  // upsert: případný osiřelý záznam smazané přihlášky se stejným číslem se přepíše.
  await tx.registrationMeta.upsert({
    where: { year_id: { year, id } },
    create: { year, id, updatedAt: now, ...meta },
    update: {
      ...meta,
      updatedAt: now,
      refundedAt: null,
      reminder1At: null,
      reminder2At: null,
      standardPayMailAt: null,
      autoCancelledAt: null,
      submittedAt: null,
      payUntil: null,
    },
  });
  await tx.registrationLine.create({
    data: {
      year,
      runnerId: runner.id,
      clubId: ctx.club.id,
      categoryId: ctx.category.id,
      registrationId: id,
      bib,
      entryFee: ctx.fee,
      author: ctx.author.slice(0, 64),
      created: now,
    },
  });
  // Ručně zadané číslo je zamčené, aby ho návrh startovky nepřečísloval.
  await tx.startLineMeta.upsert({
    where: { year_runnerId: { year, runnerId: runner.id } },
    update: { locked: true },
    create: { year, runnerId: runner.id, locked: true },
  });
  const sale = await tx.sale.create({
    data: {
      year,
      number: saleNumber,
      vs,
      total: ctx.fee,
      status: "unpaid",
      createdById: ctx.session.id,
      createdByName: ctx.author,
      registrationId: id,
      lines: {
        create: [
          {
            itemId: null,
            name: onsiteSaleLineName(ONSITE_SALE_LINE_LABEL, runner.name, ctx.category.name, bib),
            unitPrice: ctx.fee,
            quantity: 1,
            lineTotal: ctx.fee,
          },
        ],
      },
    },
    select: { id: true },
  });
  const onsite = {
    registrationId: id,
    runnerId: runner.id,
    runnerName: runner.name,
    runnerCreated: runner.created,
    clubId: ctx.club.id,
    clubName: ctx.club.name || null,
    clubCreated: ctx.club.created,
    category: ctx.category.name,
    bib,
    outsideCategory: check.outsideCategory,
  };
  await writeAudit(
    {
      actor: actor(ctx.session),
      action: "sale.created",
      target: `sale:${sale.id}`,
      detail: { vs, total: ctx.fee, onsite },
    },
    tx,
  );
  await writeAudit(
    {
      actor: actor(ctx.session),
      action: "startlist.bib_set",
      target: startLineTarget(year, runner.id),
      detail: {
        changes: { bib: { from: null, to: bib }, locked: { from: false, to: true } },
        auto: "onsite",
        registrationId: id,
        saleId: sale.id,
        outsideCategory: check.outsideCategory,
      },
    },
    tx,
  );
  return {
    ok: true,
    saleId: sale.id,
    vs,
    total: ctx.fee,
    registrationId: id,
    bib,
    outsideCategory: check.outsideCategory,
  };
}

/**
 * Prodejka dohlášky právě zaplacena (hotově, ručně převodem nebo spárováním z Fio): platba
 * přihlášky ve výši prodejky. Volat ve stejné transakci jako změnu stavu prodejky, ať platba
 * vznikne právě jednou. Stav přihlášky přepočítá `recalculateRegistrationStatus` po transakci.
 */
export async function payOnsiteRegistrationInTx(
  tx: Tx,
  sale: { year: number; registrationId: number | null; total: number },
  paidAt: Date,
): Promise<number | null> {
  if (sale.registrationId == null) return null;
  const payment = await tx.payment.create({
    data: {
      year: sale.year,
      registrationId: toPaymentRegistrationId(sale.registrationId),
      date: paidAt,
      amount: sale.total,
      author: ONSITE_PAYMENT_AUTHOR,
    },
    select: { id: true },
  });
  return payment.id;
}

/**
 * Storno nezaplacené prodejky dohlášky: přihláška zrušena, řádky (běžec + rezervované číslo)
 * smazané, aby šlo číslo i běžce znovu použít. Vrací uvolněné řádky pro audit.
 */
export async function releaseOnsiteRegistrationInTx(
  tx: Tx,
  year: number,
  registrationId: number,
): Promise<{ runnerId: string; bib: number | null; categoryId: string; clubId: string }[]> {
  const lines = await tx.registrationLine.findMany({
    where: { year, registrationId },
    select: { runnerId: true, bib: true, categoryId: true, clubId: true, entryFee: true },
  });
  if (lines.length > 0) {
    const runnerIds = lines.map((line) => line.runnerId);
    await tx.startLineMeta.deleteMany({ where: { year, runnerId: { in: runnerIds } } });
    await tx.registrationLine.deleteMany({ where: { year, registrationId } });
  }
  await tx.registration.updateMany({
    where: { year, id: registrationId },
    data: { status: ENTRY_STATUS.cancelled },
  });
  await tx.registrationMeta.updateMany({
    where: { year, id: registrationId },
    data: { updatedAt: new Date() },
  });
  return lines.map(({ runnerId, bib, categoryId, clubId }) => ({
    runnerId,
    bib,
    categoryId,
    clubId,
  }));
}
