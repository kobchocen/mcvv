"use server";

import { touchRegistration } from "@/lib/entries/touch";
import { revalidatePath, revalidateTag } from "next/cache";

import { formInt, formString } from "@/lib/admin/parse";
import { HOME_COUNTS_TAG } from "@/lib/home/summary-core";
import { getSession } from "@/lib/auth/session";
import { resolveClub } from "@/lib/entries/club";
import { recordEntryChange } from "@/lib/entries/changes";
import { computeLineFee } from "@/lib/entries/fee";
import { currentEntrySlotRow } from "@/lib/slots/entry-slot";
import { registrationCategoryFee } from "@/lib/slots/load";
import { eligibleCategories, pickCategory, resolveRunner } from "@/lib/entries/runner";
import { formDataRecord, parseNewRunner } from "@/lib/entries/new-runner-schema";
import { ENTRY_STATUS, recalculateRegistrationStatus } from "@/lib/entries/status";
import { ensureRegistration } from "@/lib/entries/ensure";
import { setAccountPromotionOptOut } from "@/lib/entries/account-promotion";
import { entryWritable } from "@/lib/entries/guard";
import {
  currentEntrySlot,
  loadEntryWriteContext,
  ownEntry,
  writableOwnEntry,
} from "@/lib/entries/writable";
import { freeEntryAllowed } from "@/lib/slots/entry-slot";
import type { EntryWriteContext } from "@/lib/slots/entry-slot";
import { promotionValue } from "@/lib/entries/promotion";
import { currentRaceYear } from "@/lib/entries/year";
import { prisma } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit/log";
import { diffFields } from "@/lib/audit/diff";
import { entryTarget } from "@/lib/entries/changes-core";
import { latePayUntil } from "@/lib/slots/late-core";
import { sendLatePayMail } from "@/lib/slots/late-mail";

type ChangeActor = Parameters<typeof recordEntryChange>[0];
type OwnRegistration = { year: number; id: number; name: string | null };
type ResolvedClub = Awaited<ReturnType<typeof resolveClub>>;

/**
 * Přihláška pro nového běžce: s číslem z formuláře vlastní přihláška, pokud ji lze měnit (její
 * termín běží). Bez čísla (0) nebo s číslem zamčené přihlášky (termín skončil – Q302/Q303) se
 * najde nebo založí přihláška e-mailu v běžícím termínu – až teď, po validaci běžce.
 */
async function registrationForNewLine(
  ctx: EntryWriteContext,
  year: number,
  session: ChangeActor & { email: string; name: string },
  /** Už ověřená vlastní přihláška z formuláře (null = bez čísla). */
  own: { year: number; id: number; name: string | null; writable: boolean } | null,
): Promise<OwnRegistration | null> {
  if (own?.writable) {
    return own;
  }
  const ensured = await ensureRegistration(
    year,
    session.email,
    session.name,
    currentEntrySlotRow(ctx),
  );
  // Odeslaná pozdní přihláška čeká na platbu – další až po zaplacení / zrušení (Q344).
  if (!ensured) return null;
  const { registration, created } = ensured;
  if (created) {
    await recordEntryChange(session, "entry.created", {
      year,
      registrationId: registration.id,
      registrationName: registration.name,
    });
  }
  return registration;
}

async function recordClubCreated(actor: ChangeActor, reg: OwnRegistration, club: ResolvedClub) {
  await recordEntryChange(actor, "entry.club_created", {
    year: reg.year,
    registrationId: reg.id,
    registrationName: reg.name,
    clubId: club.id,
    clubName: club.name,
  });
}

/** Souhrn změn (#130): případný nový klub a přihlášený závodník. */
async function recordRunnerAdded(
  actor: ChangeActor,
  reg: OwnRegistration,
  club: ResolvedClub,
  runner: { runnerId: string; runnerName: string | null; category: string; fee: number },
) {
  if (club.created) {
    await recordClubCreated(actor, reg, club);
  }
  await recordEntryChange(actor, "entry.runner_added", {
    year: reg.year,
    registrationId: reg.id,
    registrationName: reg.name,
    ...runner,
    clubId: club.id,
    clubName: club.name || null,
  });
}

export async function saveEntryHeader(formData: FormData): Promise<void> {
  const session = await getSession();
  const year = formInt(formData, "year");
  const id = formInt(formData, "id");
  if (!session || year === null || id === null) {
    return;
  }
  const ctx = await loadEntryWriteContext();
  if (!entryWritable(ctx, year)) {
    return;
  }
  // Zamčenou přihlášku (termín skončil) už přihlašující neupravuje – jen administrace (Q329).
  const row = await writableOwnEntry(ctx, year, id, session.email);
  if (!row) {
    return;
  }
  const noMail = formString(formData, "noMail") === "N";
  const name = formString(formData, "name").slice(0, 128) || session.name;
  await prisma.registration.update({
    where: { year_id: { year, id } },
    data: { name, promotion: promotionValue(noMail) },
  });
  // Souhlas patří účtu; sloupec přihlášky zůstává v souladu kvůli legacy výpisům.
  await setAccountPromotionOptOut(session.email, noMail);
  if ((row.name ?? "") !== name) {
    await recordEntryChange(session, "entry.header_changed", {
      year,
      registrationId: id,
      registrationName: name,
      from: row.name,
      to: name,
    });
  }
  await touchRegistration(year, id);
  revalidatePath("/[locale]/prihlasky", "page");
}

/**
 * Souhlas se zasíláním informací e-mailem na účtu – i bez přihlášky a i po uzávěrce.
 * Aktivní přihláška aktuálního ročníku dostane stejnou hodnotu do legacy sloupce.
 */
export async function saveAccountPromotion(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) {
    return;
  }
  const noMail = formString(formData, "noMail") === "N";
  await setAccountPromotionOptOut(session.email, noMail);
  const { year } = await currentRaceYear();
  await prisma.registration.updateMany({
    where: {
      year,
      email: { equals: session.email },
      OR: [{ status: { not: ENTRY_STATUS.cancelled } }, { status: null }],
    },
    data: { promotion: promotionValue(noMail) },
  });
  revalidatePath("/[locale]/prihlasky", "page");
}

export async function addExistingRunner(formData: FormData): Promise<void> {
  const session = await getSession();
  const year = formInt(formData, "year");
  const registrationId = formInt(formData, "registrationId");
  const runnerId = formString(formData, "runnerId");
  if (!session || year === null || !runnerId) {
    return;
  }
  // #189: nezávislé kontroly a čtení souběžně, ne jedno po druhém (každý dotaz = cesta do DB).
  const ctx = await loadEntryWriteContext();
  const [own, taken, categories, runner] = await Promise.all([
    registrationId ? ownEntry(ctx, year, registrationId, session.email) : null,
    prisma.registrationLine.findFirst({ where: { year, runnerId }, select: { runnerId: true } }),
    prisma.category.findMany(),
    prisma.runner.findUnique({ where: { id: runnerId }, select: { name: true } }),
  ]);
  if (!entryWritable(ctx, year)) {
    return;
  }
  if (registrationId && !own) {
    return;
  }
  if (taken) {
    return;
  }
  const category = pickCategory(runnerId, year, categories);
  if (!category) {
    return;
  }
  const registration = await registrationForNewLine(ctx, year, session, own);
  if (!registration) {
    return;
  }
  const allowFree = freeEntryAllowed(currentEntrySlot(ctx));
  const [club, { fee }] = await Promise.all([
    resolveClub(formString(formData, "clubName"), year, formString(formData, "clubId")),
    // Cena uložená u přihlášky (Q342), ne dnešní cena termínu.
    registrationCategoryFee(year, registration.id, category).then((base) =>
      computeLineFee(session.email, runnerId, base, { allowFree }),
    ),
  ]);
  await prisma.registrationLine.create({
    data: {
      year,
      runnerId,
      clubId: club.id,
      categoryId: category.id,
      registrationId: registration.id,
      entryFee: fee,
      author: session.email,
    },
  });
  await Promise.all([
    recordRunnerAdded(session, registration, club, {
      runnerId,
      runnerName: runner?.name ?? null,
      category: category.name,
      fee,
    }),
    touchRegistration(year, registration.id),
    recalculateRegistrationStatus(year, registration.id),
  ]);
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
  revalidatePath("/[locale]", "page");
  revalidateTag(HOME_COUNTS_TAG, "max");
}

export type AddRunnerState = {
  error?: "ambiguous" | "taken" | "invalid" | "sex";
  ok?: boolean;
};

export async function addNewRunner(
  _prev: AddRunnerState,
  formData: FormData,
): Promise<AddRunnerState> {
  const session = await getSession();
  if (!session) {
    return { error: "invalid" };
  }
  const parsed = parseNewRunner(formDataRecord(formData));
  if (!parsed.ok) {
    return { error: parsed.error };
  }
  const { year, registrationId, birthYear, firstName, lastName, sex, categoryId, nationality } =
    parsed.data;
  const ctx = await loadEntryWriteContext();
  if (!entryWritable(ctx, year)) {
    return { error: "invalid" };
  }
  const own = registrationId ? await ownEntry(ctx, year, registrationId, session.email) : null;
  if (registrationId && !own) {
    return { error: "invalid" };
  }
  const categories = await prisma.category.findMany();
  const eligible = eligibleCategories(birthYear, sex, year, categories);
  const category = eligible.find((row) => row.id === categoryId);
  if (!category) {
    return { error: "invalid" };
  }
  const resolved = await resolveRunner({
    firstName,
    lastName,
    birthYear,
    sex,
    nationality: nationality || null,
  });
  if ("error" in resolved) {
    return { error: "ambiguous" };
  }
  if (resolved.nationalityChange) {
    // Q362: stát změněný přihláškou se zapíše do auditu běžce (stejně jako změna v administraci).
    await writeAudit({
      actor: session,
      action: "runner.nationality_changed",
      target: `runner:${resolved.id}`,
      detail: {
        changes: diffFields(
          { nationality: resolved.nationalityChange.from },
          { nationality: resolved.nationalityChange.to },
        ),
        via: "entry",
      },
    });
  }
  const taken = await prisma.registrationLine.findFirst({ where: { year, runnerId: resolved.id } });
  if (taken) {
    return { error: "taken" };
  }
  const registration = await registrationForNewLine(ctx, year, session, own);
  if (!registration) {
    return { error: "invalid" };
  }
  const club = await resolveClub(
    formString(formData, "clubName"),
    year,
    formString(formData, "clubId"),
  );
  const { fee } = await computeLineFee(
    session.email,
    resolved.id,
    await registrationCategoryFee(year, registration.id, category),
    { allowFree: freeEntryAllowed(currentEntrySlot(ctx)) },
  );
  await prisma.registrationLine.create({
    data: {
      year,
      runnerId: resolved.id,
      clubId: club.id,
      categoryId: category.id,
      registrationId: registration.id,
      entryFee: fee,
      author: session.email,
    },
  });
  if (resolved.created) {
    await recordEntryChange(session, "entry.runner_created", {
      year,
      registrationId: registration.id,
      registrationName: registration.name,
      runnerId: resolved.id,
      runnerName: resolved.name,
    });
  }
  await recordRunnerAdded(session, registration, club, {
    runnerId: resolved.id,
    runnerName: resolved.name,
    category: category.name,
    fee,
  });
  await touchRegistration(year, registration.id);
  await recalculateRegistrationStatus(year, registration.id);
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
  revalidatePath("/[locale]", "page");
  revalidateTag(HOME_COUNTS_TAG, "max");
  return { ok: true };
}

export async function updateLineClub(formData: FormData): Promise<void> {
  const session = await getSession();
  const year = formInt(formData, "year");
  const registrationId = formInt(formData, "registrationId");
  const runnerId = formString(formData, "runnerId");
  if (!session || year === null || registrationId === null || !runnerId) {
    return;
  }
  const ctx = await loadEntryWriteContext();
  if (!entryWritable(ctx, year)) {
    return;
  }
  // Jen přihláška v běžícím termínu – po jeho konci je zamčená (Q303).
  const registration = await writableOwnEntry(ctx, year, registrationId, session.email);
  if (!registration) {
    return;
  }
  const before = await prisma.registrationLine.findFirst({
    where: { year, runnerId, registrationId },
    select: { clubId: true, club: { select: { name: true } }, runner: { select: { name: true } } },
  });
  const club = await resolveClub(
    formString(formData, "clubName"),
    year,
    formString(formData, "clubId"),
  );
  // Jen řádek vlastní přihlášky (dřív šlo přímým POSTem změnit klub běžce v cizí přihlášce).
  const updated = await prisma.registrationLine.updateMany({
    where: { year, runnerId, registrationId },
    data: { clubId: club.id },
  });
  if (updated.count === 0) {
    return;
  }
  if (club.created) {
    await recordClubCreated(session, registration, club);
  }
  if (before && before.clubId !== club.id) {
    await recordEntryChange(session, "entry.line_club_changed", {
      year,
      registrationId,
      registrationName: registration.name,
      runnerId,
      runnerName: before.runner.name,
      from: before.club.name,
      to: club.name,
    });
  }
  await touchRegistration(year, registrationId);
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
}

export async function removeRunner(formData: FormData): Promise<void> {
  const session = await getSession();
  const year = formInt(formData, "year");
  const registrationId = formInt(formData, "registrationId");
  const runnerId = formString(formData, "runnerId");
  if (!session || year === null || registrationId === null || !runnerId) {
    return;
  }
  const ctx = await loadEntryWriteContext();
  if (!entryWritable(ctx, year)) {
    return;
  }
  // Jen přihláška v běžícím termínu – po jeho konci je zamčená (Q303).
  const registration = await writableOwnEntry(ctx, year, registrationId, session.email);
  if (!registration) {
    return;
  }
  const line = await prisma.registrationLine.findFirst({
    where: { year, runnerId, registrationId },
    select: { runner: { select: { name: true } }, category: { select: { name: true } } },
  });
  const removed = await prisma.registrationLine.deleteMany({
    where: { year, runnerId, registrationId },
  });
  if (removed.count > 0) {
    await recordEntryChange(session, "entry.runner_removed", {
      year,
      registrationId,
      registrationName: registration.name,
      runnerId,
      runnerName: line?.runner.name ?? null,
      category: line?.category.name ?? null,
    });
  }
  await touchRegistration(year, registrationId);
  await recalculateRegistrationStatus(year, registrationId);
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
  revalidatePath("/[locale]", "page");
  revalidateTag(HOME_COUNTS_TAG, "max");
}

export type SubmitLateState = { error?: "confirm" | "empty" | "invalid"; ok?: boolean };

/**
 * Odeslání pozdní přihlášky (NAVRH 2.3): povinný souhlas „Zaplatím ihned“, aspoň jeden běžec.
 * Uloží čas odeslání a lhůtu na zaplacení (+60 min); od té chvíle přihlášku nelze z webu měnit
 * (Q330) a do lhůty ji je potřeba zaplatit, jinak se automaticky zruší.
 */
export async function submitLateEntry(
  _prev: SubmitLateState,
  formData: FormData,
): Promise<SubmitLateState> {
  const session = await getSession();
  const year = formInt(formData, "year");
  const id = formInt(formData, "registrationId");
  if (!session || year === null || id === null) {
    return { error: "invalid" };
  }
  if (formString(formData, "payNow") !== "1") {
    return { error: "confirm" };
  }
  const ctx = await loadEntryWriteContext();
  if (!entryWritable(ctx, year)) {
    return { error: "invalid" };
  }
  const own = await writableOwnEntry(ctx, year, id, session.email);
  if (!own || own.slot !== "late") {
    return { error: "invalid" };
  }
  const lines = await prisma.registrationLine.findMany({
    where: { year, registrationId: id },
    select: { entryFee: true },
  });
  if (lines.length === 0) {
    return { error: "empty" };
  }
  const now = ctx.now;
  const payUntil = latePayUntil(now);
  // Zabrat: jen dosud neodeslanou (dvojí odeslání nebo souběh lhůtu neposune).
  const claimed = await prisma.registrationMeta.updateMany({
    where: { year, id, slot: "late", submittedAt: null },
    data: { submittedAt: now, payUntil },
  });
  if (claimed.count !== 1) {
    return { error: "invalid" };
  }
  await recalculateRegistrationStatus(year, id);
  try {
    await writeAudit({
      actor: session,
      action: "entry.late_submitted",
      target: entryTarget(year, id),
      detail: {
        year,
        registrationId: id,
        fee: lines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0),
        payUntil: payUntil.toISOString(),
      },
    });
  } catch (error) {
    console.error("[entries] late submit audit failed", error);
  }
  await touchRegistration(year, id);
  // E-mail k „zaplaťte dnes do HH:MM“ hned po odeslání (Q350).
  await sendLatePayMail(year, id);
  revalidatePath("/[locale]/prihlasky", "page");
  return { ok: true };
}
