"use server";

import { touchRegistration } from "@/lib/entries/touch";
import { revalidatePath } from "next/cache";

import { formInt, formString } from "@/lib/admin/parse";
import { getSession } from "@/lib/auth/session";
import { resolveClubId } from "@/lib/entries/club";
import { computeLineFee } from "@/lib/entries/fee";
import { eligibleCategories, pickCategory, resolveRunner } from "@/lib/entries/runner";
import { formDataRecord, parseNewRunner } from "@/lib/entries/new-runner-schema";
import { recalculateRegistrationStatus } from "@/lib/entries/status";
import { entryWritable } from "@/lib/entries/guard";
import { promotionValue } from "@/lib/entries/promotion";
import { currentRaceYear } from "@/lib/entries/year";
import { prisma } from "@/lib/db/client";

async function ownRegistration(year: number, id: number, email: string) {
  return prisma.registration.findFirst({
    where: { year, id, email: { equals: email } },
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
  await prisma.registration.update({
    where: { year_id: { year, id } },
    data: {
      name: formString(formData, "name").slice(0, 128) || session.name,
      promotion: promotionValue(noMail),
    },
  });
  await touchRegistration(year, id);
  revalidatePath("/[locale]/prihlasky", "page");
}

export async function addExistingRunner(formData: FormData): Promise<void> {
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
  const taken = await prisma.registrationLine.findFirst({ where: { year, runnerId } });
  if (taken) {
    return;
  }
  const categories = await prisma.category.findMany();
  const category = pickCategory(runnerId, year, categories);
  if (!category) {
    return;
  }
  const clubId = await resolveClubId(formString(formData, "clubName"), year);
  const { fee } = await computeLineFee(session.email, runnerId, category.entryFee);
  await prisma.registrationLine.create({
    data: {
      year,
      runnerId,
      clubId,
      categoryId: category.id,
      registrationId,
      entryFee: fee,
      author: session.email,
    },
  });
  await touchRegistration(year, registrationId);
  await recalculateRegistrationStatus(year, registrationId);
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
  const registration = await ownRegistration(year, registrationId, session.email);
  if (!registration) {
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
  const clubId = await resolveClubId(formString(formData, "clubName"), year);
  const { fee } = await computeLineFee(session.email, resolved.id, category.entryFee);
  await prisma.registrationLine.create({
    data: {
      year,
      runnerId: resolved.id,
      clubId,
      categoryId: category.id,
      registrationId,
      entryFee: fee,
      author: session.email,
    },
  });
  await touchRegistration(year, registrationId);
  await recalculateRegistrationStatus(year, registrationId);
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
  const clubId = await resolveClubId(formString(formData, "clubName"), year);
  // Jen řádek vlastní přihlášky (dřív šlo přímým POSTem změnit klub běžce v cizí přihlášce).
  const updated = await prisma.registrationLine.updateMany({
    where: { year, runnerId, registrationId },
    data: { clubId },
  });
  if (updated.count === 0) {
    return;
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
  await prisma.registrationLine.deleteMany({
    where: { year, runnerId, registrationId },
  });
  await touchRegistration(year, registrationId);
  await recalculateRegistrationStatus(year, registrationId);
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
  revalidatePath("/[locale]", "page");
}
