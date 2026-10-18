import { prisma } from "@/lib/db/client";

/** Zaznamená poslední změnu přihlášky (pro připomínku R1 „24 h po poslední změně“). */
export async function touchRegistration(year: number, id: number, now = new Date()): Promise<void> {
  await prisma.registrationMeta.upsert({
    where: { year_id: { year, id } },
    create: { year, id, updatedAt: now },
    update: { updatedAt: now },
  });
}
