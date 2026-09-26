"use server";

import { revalidatePath } from "next/cache";

import { formInt, formString } from "@/lib/admin/parse";
import { getSession } from "@/lib/auth/session";
import { resolveClubId } from "@/lib/entries/club";
import { computeLineFee } from "@/lib/entries/fee";
import { eligibleCategories, pickCategory, resolveRunner } from "@/lib/entries/runner";
import { recalculateRegistrationStatus } from "@/lib/entries/status";
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
  const { open } = await currentRaceYear();
  if (!open) {
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
      note: formString(formData, "note") || null,
      promotion: noMail ? "N" : null,
    },
  });
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
  const { open } = await currentRaceYear();
  if (!open) {
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
  await recalculateRegistrationStatus(year, registrationId);
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
  revalidatePath("/[locale]", "page");
}

export async function addNewRunner(formData: FormData): Promise<void> {
  const session = await getSession();
  const year = formInt(formData, "year");
  const registrationId = formInt(formData, "registrationId");
  const birthYear = formInt(formData, "birthYear");
  const firstName = formString(formData, "firstName");
  const lastName = formString(formData, "lastName");
  const sexRaw = formString(formData, "sex");
  const categoryId = formString(formData, "categoryId");
  const sex = sexRaw === "F" ? "F" : sexRaw === "M" ? "M" : null;
  if (
    !session ||
    year === null ||
    registrationId === null ||
    !birthYear ||
    !firstName ||
    !lastName ||
    !sex ||
    !categoryId
  ) {
    return;
  }
  const { open } = await currentRaceYear();
  if (!open) {
    return;
  }
  const registration = await ownRegistration(year, registrationId, session.email);
  if (!registration) {
    return;
  }
  const categories = await prisma.category.findMany();
  const eligible = eligibleCategories(birthYear, sex, year, categories);
  const category = eligible.find((row) => row.id === categoryId);
  if (!category) {
    return;
  }
  const runnerId = await resolveRunner({ firstName, lastName, birthYear, sex });
  const taken = await prisma.registrationLine.findFirst({ where: { year, runnerId } });
  if (taken) {
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
  await recalculateRegistrationStatus(year, registrationId);
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
  revalidatePath("/[locale]", "page");
}

export async function updateLineClub(formData: FormData): Promise<void> {
  const session = await getSession();
  const year = formInt(formData, "year");
  const registrationId = formInt(formData, "registrationId");
  const runnerId = formString(formData, "runnerId");
  if (!session || year === null || registrationId === null || !runnerId) {
    return;
  }
  const { open } = await currentRaceYear();
  if (!open) {
    return;
  }
  const registration = await ownRegistration(year, registrationId, session.email);
  if (!registration) {
    return;
  }
  const clubId = await resolveClubId(formString(formData, "clubName"), year);
  await prisma.registrationLine.update({
    where: { year_runnerId: { year, runnerId } },
    data: { clubId },
  });
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
  const { open } = await currentRaceYear();
  if (!open) {
    return;
  }
  const registration = await ownRegistration(year, registrationId, session.email);
  if (!registration) {
    return;
  }
  await prisma.registrationLine.deleteMany({
    where: { year, runnerId, registrationId },
  });
  await recalculateRegistrationStatus(year, registrationId);
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/prihlaseni-zavodnici", "page");
  revalidatePath("/[locale]", "page");
}
