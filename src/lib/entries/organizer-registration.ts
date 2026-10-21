import { prisma } from "@/lib/db/client";
import {
  ORGANIZER_REGISTRATION_EMAIL_KEY,
  ORGANIZER_REGISTRATION_NAME,
  ORGANIZER_REGISTRATION_NUMBER,
  planOrganizerRegistration,
  resolveOrganizerRegistrationEmail,
  type OrganizerRegistrationPlan,
} from "@/lib/entries/organizer-registration-core";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";

/** Uložená hodnota nastavení (prázdná = výchozí adresa). */
export async function getOrganizerRegistrationEmailText(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: ORGANIZER_REGISTRATION_EMAIL_KEY } });
  return row?.text ?? "";
}

export async function getOrganizerRegistrationEmail(): Promise<string> {
  return resolveOrganizerRegistrationEmail(await getOrganizerRegistrationEmailText());
}

/** `email` už je zvalidovaný (nebo prázdný = výchozí). */
export async function saveOrganizerRegistrationEmail(email: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: ORGANIZER_REGISTRATION_EMAIL_KEY },
    update: { text: email },
    create: { key: ORGANIZER_REGISTRATION_EMAIL_KEY, text: email },
  });
}

/**
 * Založí přihlášku pořadatelů (č. 1) ročníku, pokud ještě neexistuje. Volá se při uložení
 * ročníku; opakované volání nic nemění.
 */
export async function ensureOrganizerRegistration(
  year: number,
  author: string,
): Promise<OrganizerRegistrationPlan> {
  const email = await getOrganizerRegistrationEmail();
  const rows = await prisma.registration.findMany({
    where: { year },
    select: { id: true, email: true, status: true },
  });
  const plan = planOrganizerRegistration(rows, email);
  if (plan.action !== "create") {
    return plan;
  }
  try {
    await prisma.registration.create({
      data: {
        year,
        id: ORGANIZER_REGISTRATION_NUMBER,
        email,
        name: ORGANIZER_REGISTRATION_NAME,
        type: "O",
        status: ENTRY_STATUS.empty,
        author: author.slice(0, 64),
        created: new Date(),
      },
    });
  } catch (error) {
    // Souběh: č. 1 mezitím vzniklo jinak.
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      return { action: "exists" };
    }
    throw error;
  }
  return plan;
}
