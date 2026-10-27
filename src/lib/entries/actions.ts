"use server";

import { touchRegistration } from "@/lib/entries/touch";
import { revalidatePath } from "next/cache";

import { formInt, formString } from "@/lib/admin/parse";
import { getSession } from "@/lib/auth/session";
import { resolveClub } from "@/lib/entries/club";
import { recordEntryChange } from "@/lib/entries/changes";
import { computeLineFee } from "@/lib/entries/fee";
import { eligibleCategories, pickCategory, resolveRunner } from "@/lib/entries/runner";
import { formDataRecord, parseNewRunner } from "@/lib/entries/new-runner-schema";
import { ENTRY_STATUS, recalculateRegistrationStatus } from "@/lib/entries/status";
import { ensureRegistration } from "@/lib/entries/ensure";
import { setAccountPromotionOptOut } from "@/lib/entries/account-promotion";
import { entryWritable } from "@/lib/entries/guard";
import { promotionValue } from "@/lib/entries/promotion";
import { currentRaceYear } from "@/lib/entries/year";
import { prisma } from "@/lib/db/client";

/** Vlastní nezrušená přihláška (zrušenou pořadatelem už přihlašující měnit nesmí). */
async function ownRegistration(year: number, id: number, email: string) {
  return prisma.registration.findFirst({
    where: {
      year,
      id,
      email: { equals: email },
      OR: [{ status: { not: ENTRY_STATUS.cancelled } }, { status: null }],
    },
  });
}

type ChangeActor = Parameters<typeof recordEntryChange>[0];
type OwnRegistration = { year: number; id: number; name: string | null };
type ResolvedClub = Awaited<ReturnType<typeof resolveClub>>;

/**
 * Přihláška pro nového běžce: s číslem z formuláře jen vlastní přihláška, bez čísla (0)
 * se přihláška ročníku najde nebo založí – až teď, po validaci běžce.
 */
async function registrationForNewLine(
  year: number,
  registrationId: number | null,
  session: ChangeActor & { email: string; name: string },
  /** Už ověřená vlastní přihláška (rychlá nabídka ji načítá souběžně s ostatními kontrolami). */
  own?: OwnRegistration | null,
) {
  if (registrationId) {
    return own !== undefined ? own : ownRegistration(year, registrationId, session.email);
  }
  const { registration, created } = await ensureRegistration(year, session.email, session.name);
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
  if (!entryWritable(await currentRaceYear(), year)) {
    return;
  }
  const row = await ownRegistration(year, id, session.email);
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
  const [race, own, taken, categories, runner] = await Promise.all([
    currentRaceYear(),
    registrationId ? ownRegistration(year, registrationId, session.email) : null,
    prisma.registrationLine.findFirst({ where: { year, runnerId }, select: { runnerId: true } }),
    prisma.category.findMany(),
    prisma.runner.findUnique({ where: { id: runnerId }, select: { name: true } }),
  ]);
  if (!entryWritable(race, year)) {
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
  const registration = await registrationForNewLine(year, registrationId, session, own);
  if (!registration) {
    return;
  }
  const [club, { fee }] = await Promise.all([
    resolveClub(formString(formData, "clubName"), year, formString(formData, "clubId")),
    computeLineFee(session.email, runnerId, category.entryFee),
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
  const { year, registrationId, birthYear, firstName, lastName, sex, categoryId } = parsed.data;
  if (!entryWritable(await currentRaceYear(), year)) {
    return { error: "invalid" };
  }
  if (registrationId && !(await ownRegistration(year, registrationId, session.email))) {
    return { error: "invalid" };
  }
  const categories = await prisma.category.findMany();
  const eligible = eligibleCategories(birthYear, sex, year, categories);
  const category = eligible.find((row) => row.id === categoryId);
  if (!category) {
    return { error: "invalid" };
  }
  const resolved = await resolveRunner({ firstName, lastName, birthYear, sex });
  if ("error" in resolved) {
    return { error: "ambiguous" };
  }
  const taken = await prisma.registrationLine.findFirst({ where: { year, runnerId: resolved.id } });
  if (taken) {
    return { error: "taken" };
  }
  const registration = await registrationForNewLine(year, registrationId, session);
  if (!registration) {
    return { error: "invalid" };
  }
  const club = await resolveClub(
    formString(formData, "clubName"),
    year,
    formString(formData, "clubId"),
  );
  const { fee } = await computeLineFee(session.email, resolved.id, category.entryFee);
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
  if (!entryWritable(await currentRaceYear(), year)) {
    return;
  }
  const registration = await ownRegistration(year, registrationId, session.email);
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
  if (!entryWritable(await currentRaceYear(), year)) {
    return;
  }
  const registration = await ownRegistration(year, registrationId, session.email);
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
}
