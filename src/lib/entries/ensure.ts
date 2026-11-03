import { prisma } from "@/lib/db/client";
import { loadAccountPromotionOptOut } from "@/lib/entries/account-promotion";
import { nextRegistrationId, retryOnUniqueViolation } from "@/lib/entries/ensure-core";
import { promotionValue } from "@/lib/entries/promotion";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";
import type { SlotType } from "@/lib/slots/core";
import { pickWritableRegistration } from "@/lib/slots/entry-slot";

export type EnsuredRegistration = {
  registration: { year: number; id: number; name: string | null; email: string | null };
  /** true = přihláška právě vznikla (první přidaný běžec). */
  created: boolean;
};

/**
 * Vrátí aktivní přihlášku e-mailu v ročníku a termínu, nebo ji založí (číslo = max + 1
 * v ročníku) a zapíše k ní termín. Jedna přihláška na e-mail a termín (Q302): po konci termínu
 * vznikne pro dalšího běžce nová přihláška s vlastním VS. `slot` null = ročník bez termínů
 * (dosavadní chování: jedna přihláška na e-mail a ročník).
 * Volá se jen při přidání prvního běžce – návštěva stránky ani přihlášení nic nezakládá.
 * Hledání a založení běží v transakci; kolize čísla (souběh, P2002) se zopakuje.
 */
export async function ensureRegistration(
  year: number,
  email: string,
  displayName: string,
  slot: SlotType | null = null,
): Promise<EnsuredRegistration> {
  // Legacy sloupec `promotion` se plní ze souhlasu na účtu (newsletter už čte účet).
  const promotion = promotionValue(await loadAccountPromotionOptOut(email));
  return retryOnUniqueViolation(() =>
    prisma.$transaction(async (tx) => {
      const yearRows = await tx.registration.findMany({
        where: { year },
        select: { year: true, id: true, name: true, email: true, status: true },
      });
      const metas =
        slot === null
          ? []
          : await tx.registrationMeta.findMany({
              where: { year },
              select: { id: true, slot: true },
            });
      const slotById = new Map(metas.map((meta) => [meta.id, meta.slot]));
      const existing = pickWritableRegistration(
        yearRows.map((row) => ({ ...row, slot: slotById.get(row.id) ?? null })),
        email,
        slot,
      );
      if (existing) {
        const { year: y, id: i, name, email: e } = existing;
        return { registration: { year: y, id: i, name, email: e }, created: false };
      }
      const id = nextRegistrationId(Math.max(0, ...yearRows.map((row) => row.id)));
      const registration = await tx.registration.create({
        data: {
          year,
          id,
          email,
          name: displayName.slice(0, 128),
          type: "O",
          status: ENTRY_STATUS.empty,
          author: email,
          created: new Date(),
          promotion,
        },
        select: { year: true, id: true, name: true, email: true },
      });
      if (slot !== null) {
        // upsert: případný osiřelý záznam smazané přihlášky se stejným číslem se přepíše.
        await tx.registrationMeta.upsert({
          where: { year_id: { year, id } },
          create: { year, id, slot },
          update: {
            slot,
            reminder1At: null,
            reminder2At: null,
            standardPayMailAt: null,
            autoCancelledAt: null,
          },
        });
      }
      return { registration, created: true };
    }),
  );
}
