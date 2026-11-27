import { Prisma } from "@prisma/client";

import { toPaymentRegistrationId } from "@/lib/admin/parse";
import { startLineTarget } from "@/lib/audit/startlist";
import { writeAudit } from "@/lib/audit/log";
import type { SessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { isRetryableTxError, withTxRetry } from "@/lib/db/tx-retry";
import { eligibleCategoriesFor } from "@/lib/entries/category";
import { resolveClub } from "@/lib/entries/club";
import { nextRegistrationId } from "@/lib/entries/ensure-core";
import { resolveRunner } from "@/lib/entries/runner";
import { ENTRY_STATUS, nextStatus } from "@/lib/entries/status";
import { normalizeEmail } from "@/lib/newsletter/core";
import { loadStartSettings } from "@/lib/race/startlist-load";
import { slotFee, slotOf } from "@/lib/slots/core";
import { BIB_LOCK } from "@/lib/slots/late-paid";
import { categoryFeeGroup, loadSlots } from "@/lib/slots/load";

import { onsiteEntryAmount, saleLinesTotal } from "./cart-core";
import { saleVs, SALE_LINES_MAX, SALE_NUMBER_MAX } from "./core";
import { receiptLocale } from "./receipt-mail";
import { suggestOnsiteBib, type OnsiteBibSuggestion } from "./onsite-bib-core";
import {
  checkOnsiteBib,
  ONSITE_PAYMENT_AUTHOR,
  ONSITE_SALE_LINE_LABEL,
  onsiteSaleLineName,
  type OnsiteEntryInput,
} from "./onsite-core";

/**
 * Dohláška na místě (#222, košík #378): každý běžec je řádek otevřené prodejky (košíku). První
 * dohláška košíku založí přihlášku typu O, další běžci jsou její další řádky (jedna přihláška
 * s více běžci, rozhodnutí Pavla 26. 11.). Číslo se rezervuje hned (řádek zamčený ve startovce).
 * Zaplacení prodejky = platba přihlášky ve výši startovného (bez merche, mcvv_platba, autor
 * „pokladna“), storno nezaplacené prodejky = zrušení přihlášky a uvolnění všech čísel i běžců.
 */

type Tx = Prisma.TransactionClient;

export type OnsiteEntryError =
  | "no_slot"
  | "category"
  | "ambiguous"
  | "runner_taken"
  | "bib_taken"
  | "bib_champion"
  | "no_bib"
  | "full"
  | "busy"
  /** Košík mezitím někdo uzavřel k platbě, zaplatil nebo stornoval. */
  | "cart_closed"
  | "too_many";

export type CreateOnsiteEntryResult =
  | {
      ok: true;
      saleId: number;
      vs: string;
      /** Aktuální součet košíku po přidání běžce. */
      total: number;
      registrationId: number;
      bib: number;
      outsideCategory: boolean;
      /** Číslo vybral systém (návrh nejbližšího volného), ne pokladní ručně. */
      bibAuto: boolean;
      runnerName: string;
      /** Prodejka (košík) vznikla tímto přidáním. */
      created: boolean;
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

/**
 * Přidá dohlášku do košíku `saleId` (null = založí nový košík). Vše pod zámkem čísel (GET_LOCK)
 * jako dřív: rezervace čísla, řádek přihlášky, řádek prodejky a přepočet součtu košíku.
 */
export async function addOnsiteRunnerToCart(
  session: SessionUser,
  year: number,
  input: OnsiteEntryInput,
  saleId: number | null,
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

  // Dvě pokladny zakládající nového běžce stejného ročníku narození a pohlaví mohou souběžně
  // spočítat stejné id (P2002) – zopakovat, další pokus už id druhé pokladny vidí.
  const runner = await withTxRetry(
    () =>
      resolveRunner({
        firstName: input.firstName,
        lastName: input.lastName,
        birthYear: input.birthYear,
        sex: input.sex,
        nationality: input.nationality,
      }),
    { attempts: 4 },
  );
  if ("error" in runner) return { ok: false, error: "ambiguous" };
  const already = await prisma.registrationLine.findFirst({
    where: { year, runnerId: runner.id },
    select: { runnerId: true },
  });
  if (already) return { ok: false, error: "runner_taken" };
  const [club, settings] = await Promise.all([
    withTxRetry(() => resolveClub(input.clubName, year), { attempts: 4 }),
    loadStartSettings(year),
  ]);
  const range = settings.ranges.find((row) => row.categoryId === category.id) ?? null;
  const champions = [settings.champions.men, settings.champions.women];
  // Automatický režim: prázdné číslo, nebo pokladní nechal návrh beze změny – číslo se
  // vybere znovu pod zámkem (souběžná pokladna mohla návrh mezitím obsadit).
  const auto = input.bib === undefined || input.bibAuto;
  const author = actorName(session);
  const email = input.email ? input.email.toLowerCase() : null;
  // Účtenka (#223): zaplacení prodejky pošle účtenku na e-mail košíku automaticky.
  // E-mail běžce (nebo zvlášť zadaný) se uloží ke košíku, pokud ještě žádný nemá; v košíku ho
  // pokladní může před platbou změnit nebo smazat.
  const receiptEmail = normalizeEmail(input.receiptEmail) ?? normalizeEmail(input.email);
  const receipt = {
    email: receiptEmail,
    locale: receiptEmail ? receiptLocale(input.receiptLocale) : null,
  };

  // Stejná logika zámku jako přidělení čísel pozdním přihláškám (late-paid, #348): GET_LOCK,
  // zamykací čtení čísel ročníku a opakování celé transakce při souběhu (db/tx-retry).
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
              // Předchozí držitel zámku ho uvolní těsně před COMMITem. Zamykací čtení čísel ročníku
              // počká na jeho nepotvrzené řádky, takže snímek transakce (první běžné čtení až po
              // něm) už jeho čísla, přihlášku i prodejku vidí – žádné duplicitní číslo ani 1020.
              await tx.$queryRaw`
              SELECT cislo FROM mcvv_prihlaska_radek WHERE rok = ${year} AND cislo > 0
              LOCK IN SHARE MODE`;
              return await addRunnerInTx(tx, {
                session,
                saleId,
                year,
                author,
                email,
                receipt,
                runner,
                club,
                category,
                fee,
                slot,
                bib: input.bib ?? null,
                auto,
                range,
                champions,
                suggest: (taken) =>
                  suggestOnsiteBib({
                    model: settings.model,
                    categoryId: category.id,
                    ranges: settings.ranges,
                    taken,
                    champions,
                    raceDate: settings.raceDate,
                    now: new Date(),
                  }),
              });
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

async function addRunnerInTx(
  tx: Tx,
  ctx: {
    session: SessionUser;
    saleId: number | null;
    year: number;
    author: string;
    email: string | null;
    receipt: { email: string | null; locale: string | null };
    runner: { id: string; name: string; created: boolean };
    club: { id: string; name: string; created: boolean };
    category: { id: string; name: string };
    fee: number;
    slot: { feeAdult: number; feeYouth: number };
    bib: number | null;
    auto: boolean;
    range: { bibFrom: number; bibTo: number } | null;
    champions: (number | null)[];
    suggest: (taken: ReadonlySet<number>) => OnsiteBibSuggestion | null;
  },
): Promise<CreateOnsiteEntryResult> {
  const { year, runner } = ctx;
  // Košík: řádek prodejky zamknout dřív než cokoli měnit (souběžné přidání do stejného košíku).
  let cart: {
    id: number;
    vs: string;
    registrationId: number | null;
    email: string | null;
    lines: number;
  } | null = null;
  if (ctx.saleId != null) {
    await tx.$queryRaw`SELECT id FROM mcvv_sale WHERE id = ${ctx.saleId} FOR UPDATE`;
    const found = await tx.sale.findUnique({
      where: { id: ctx.saleId },
      select: {
        id: true,
        year: true,
        vs: true,
        status: true,
        checkoutAt: true,
        registrationId: true,
        email: true,
        _count: { select: { lines: true } },
      },
    });
    if (!found || found.year !== year || found.status !== "unpaid" || found.checkoutAt != null) {
      return { ok: false, error: "cart_closed" };
    }
    if (found._count.lines >= SALE_LINES_MAX) return { ok: false, error: "too_many" };
    cart = {
      id: found.id,
      vs: found.vs,
      registrationId: found.registrationId,
      email: found.email,
      lines: found._count.lines,
    };
  }
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
  let bib: number;
  if (ctx.auto) {
    const suggestion = ctx.suggest(taken);
    if (!suggestion) return { ok: false, error: "no_bib" };
    bib = suggestion.bib;
  } else if (ctx.bib == null) {
    return { ok: false, error: "no_bib" };
  } else bib = ctx.bib;
  const check = checkOnsiteBib(bib, taken, ctx.champions, ctx.range);
  if (!check.ok) return check;

  const now = new Date();
  let created = false;
  if (!cart) {
    const maxSale = await tx.sale.aggregate({ where: { year }, _max: { number: true } });
    const saleNumber = (maxSale._max.number ?? 0) + 1;
    if (saleNumber > SALE_NUMBER_MAX) return { ok: false, error: "full" };
    const vs = saleVs(year, saleNumber);
    const sale = await tx.sale.create({
      data: {
        year,
        number: saleNumber,
        vs,
        total: 0,
        status: "unpaid",
        createdById: ctx.session.id,
        createdByName: ctx.author,
        email: ctx.receipt.email,
        locale: ctx.receipt.locale,
        checkoutAt: null,
      },
      select: { id: true },
    });
    cart = { id: sale.id, vs, registrationId: null, email: ctx.receipt.email, lines: 0 };
    created = true;
    await writeAudit(
      {
        actor: actor(ctx.session),
        action: "sale.created",
        target: `sale:${sale.id}`,
        detail: { vs, total: 0, open: true },
      },
      tx,
    );
  }

  let id = cart.registrationId;
  if (id == null) {
    // První dohláška košíku založí přihlášku typu O; další běžci budou její další řádky.
    const maxReg = await tx.registration.aggregate({ where: { year }, _max: { id: true } });
    id = nextRegistrationId(maxReg._max.id);
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
        note: `Dohláška na místě, prodejka ${cart.vs}`,
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
  }
  const lineName = onsiteSaleLineName(ONSITE_SALE_LINE_LABEL, runner.name, ctx.category.name, bib);
  const saleLine = await tx.saleLine.create({
    data: {
      saleId: cart.id,
      itemId: null,
      entry: true,
      name: lineName,
      unitPrice: ctx.fee,
      quantity: 1,
      lineTotal: ctx.fee,
    },
    select: { id: true },
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
      saleLineId: saleLine.id,
    },
  });
  if (cart.registrationId != null) {
    // Další běžec stejné přihlášky: stav podle počtu řádků a startovného (zatím nic nezaplaceno).
    const [registration, regLines] = await Promise.all([
      tx.registration.findUnique({
        where: { year_id: { year, id } },
        select: { status: true, email: true },
      }),
      tx.registrationLine.findMany({
        where: { year, registrationId: id },
        select: { entryFee: true },
      }),
    ]);
    const fee = regLines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0);
    await tx.registration.update({
      where: { year_id: { year, id } },
      data: {
        status: nextStatus(registration?.status, regLines.length, fee, 0),
        ...(registration?.email == null && ctx.email ? { email: ctx.email } : {}),
      },
    });
    await tx.registrationMeta.updateMany({ where: { year, id }, data: { updatedAt: now } });
  }
  // Ručně zadané číslo je zamčené, aby ho návrh startovky nepřečísloval.
  await tx.startLineMeta.upsert({
    where: { year_runnerId: { year, runnerId: runner.id } },
    update: { locked: true },
    create: { year, runnerId: runner.id, locked: true },
  });
  const all = await tx.saleLine.findMany({
    where: { saleId: cart.id },
    select: { lineTotal: true },
  });
  const total = saleLinesTotal(all);
  await tx.sale.update({
    where: { id: cart.id },
    data: {
      total,
      registrationId: id,
      // Účtenka (#223): první zadaný e-mail košíku; v košíku ho pokladní může před platbou změnit.
      ...(cart.email == null && ctx.receipt.email
        ? { email: ctx.receipt.email, locale: ctx.receipt.locale }
        : {}),
    },
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
      action: "sale.line_added",
      target: `sale:${cart.id}`,
      detail: {
        vs: cart.vs,
        lineId: saleLine.id,
        name: lineName,
        price: ctx.fee,
        total,
        onsite,
      },
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
        bibAuto: ctx.auto,
        registrationId: id,
        saleId: cart.id,
        outsideCategory: check.outsideCategory,
      },
    },
    tx,
  );
  return {
    ok: true,
    saleId: cart.id,
    vs: cart.vs,
    total,
    registrationId: id,
    bib,
    outsideCategory: check.outsideCategory,
    bibAuto: ctx.auto,
    runnerName: runner.name,
    created,
  };
}

/**
 * Návrh čísla pro formulář pokladny (bez zámku – jen předvyplnění; při uložení se v
 * automatickém režimu vybírá znovu pod zámkem). Null = kategorie neexistuje nebo nic volného.
 */
export async function suggestOnsiteBibFor(
  year: number,
  categoryId: string,
  now = new Date(),
): Promise<OnsiteBibSuggestion | null> {
  const [settings, lines, imported] = await Promise.all([
    loadStartSettings(year),
    prisma.registrationLine.findMany({ where: { year, bib: { gt: 0 } }, select: { bib: true } }),
    prisma.startEntry.findMany({ where: { year, bib: { gt: 0 } }, select: { bib: true } }),
  ]);
  const taken = new Set<number>([...lines.map((l) => l.bib!), ...imported.map((r) => r.bib)]);
  return suggestOnsiteBib({
    model: settings.model,
    categoryId,
    ranges: settings.ranges,
    taken,
    champions: [settings.champions.men, settings.champions.women],
    raceDate: settings.raceDate,
    now,
  });
}

/**
 * Prodejka s dohláškou právě zaplacena (hotově, ručně převodem nebo spárováním z Fio): platba
 * přihlášky ve výši startovného – jen řádky dohlášek, ne merch (#378). Volat ve stejné transakci
 * jako změnu stavu prodejky, ať platba vznikne právě jednou. Stav přihlášky přepočítá
 * `recalculateRegistrationStatus` po transakci.
 */
export async function payOnsiteRegistrationInTx(
  tx: Tx,
  sale: { id: number; year: number; registrationId: number | null; total: number },
  paidAt: Date,
): Promise<{ paymentId: number; amount: number } | null> {
  if (sale.registrationId == null) return null;
  const lines = await tx.saleLine.findMany({
    where: { saleId: sale.id },
    select: { entry: true, lineTotal: true },
  });
  const amount = onsiteEntryAmount(sale, lines);
  if (amount == null) return null;
  const payment = await tx.payment.create({
    data: {
      year: sale.year,
      registrationId: toPaymentRegistrationId(sale.registrationId),
      date: paidAt,
      amount,
      author: ONSITE_PAYMENT_AUTHOR,
    },
    select: { id: true },
  });
  return { paymentId: payment.id, amount };
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

/**
 * Odebrání jednoho běžce z otevřeného košíku (#378): podle řádku prodejky najde jeho řádek
 * přihlášky (`saleLineId`), smaže ho i zámek ve
 * startovce (číslo se uvolní). Když přihláška zůstane bez běžců, zruší se. Vrací uvolněný řádek
 * pro audit, nebo null, pokud běžec v přihlášce už není.
 */
export async function releaseOnsiteRunnerInTx(
  tx: Tx,
  year: number,
  registrationId: number,
  saleLineId: number,
): Promise<{
  released: { runnerId: string; bib: number | null; categoryId: string; clubId: string } | null;
  remaining: number;
}> {
  const line = await tx.registrationLine.findFirst({
    where: { year, registrationId, saleLineId },
    select: { runnerId: true, bib: true, categoryId: true, clubId: true },
  });
  if (line) {
    await tx.startLineMeta.deleteMany({ where: { year, runnerId: line.runnerId } });
    await tx.registrationLine.deleteMany({
      where: { year, registrationId, runnerId: line.runnerId },
    });
  }
  const rest = await tx.registrationLine.findMany({
    where: { year, registrationId },
    select: { entryFee: true },
  });
  const now = new Date();
  if (rest.length === 0) {
    await tx.registration.updateMany({
      where: { year, id: registrationId },
      data: { status: ENTRY_STATUS.cancelled },
    });
  } else {
    const registration = await tx.registration.findUnique({
      where: { year_id: { year, id: registrationId } },
      select: { status: true },
    });
    const fee = rest.reduce((sum, row) => sum + (row.entryFee ?? 0), 0);
    await tx.registration.updateMany({
      where: { year, id: registrationId },
      data: { status: nextStatus(registration?.status, rest.length, fee, 0) },
    });
  }
  await tx.registrationMeta.updateMany({
    where: { year, id: registrationId },
    data: { updatedAt: now },
  });
  return { released: line, remaining: rest.length };
}
