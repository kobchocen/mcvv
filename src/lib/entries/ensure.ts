import { prisma } from "@/lib/db/client";
import { loadAccountPromotionOptOut } from "@/lib/entries/account-promotion";
import { nextRegistrationId, retryOnUniqueViolation } from "@/lib/entries/ensure-core";
import { promotionValue } from "@/lib/entries/promotion";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";
import type { Slot } from "@/lib/slots/core";
import { pickWritableRegistration } from "@/lib/slots/entry-slot";
import { pickLateTarget } from "@/lib/slots/late-core";

export type EnsuredRegistration = {
  registration: { year: number; id: number; name: string | null; email: string | null };
  /** true = přihláška právě vznikla (první přidaný běžec). */
  created: boolean;
};

/**
 * Vrátí aktivní přihlášku e-mailu v ročníku a termínu, nebo ji založí (číslo = max + 1
 * v ročníku) a zapíše k ní termín a jeho dnešní startovné (Q342 – pozdější změna ceny termínu
 * přihlášku neovlivní). Jedna přihláška na e-mail a termín (Q302): po konci termínu
 * vznikne pro dalšího běžce nová přihláška s vlastním VS. `slot` null = ročník bez termínů
 * (dosavadní chování: jedna přihláška na e-mail a ročník).
 * Volá se jen při přidání prvního běžce – návštěva stránky ani přihlášení nic nezakládá.
 * Hledání a založení běží v transakci; kolize čísla (souběh, P2002) se zopakuje.
 * Pozdní přihlášky: přidává se do rozpracované (neodeslané) pozdní přihlášky; zaplacená se
 * nedoplňuje (Q343). Čeká-li odeslaná pozdní přihláška na platbu, nová se nezakládá (Q344) → null.
 */
export async function ensureRegistration(
  year: number,
  email: string,
  displayName: string,
  slot: Slot | null = null,
): Promise<EnsuredRegistration | null> {
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
              select: { id: true, slot: true, submittedAt: true },
            });
      const metaById = new Map(metas.map((meta) => [meta.id, meta]));
      const rows = yearRows.map((row) => ({
        ...row,
        slot: metaById.get(row.id)?.slot ?? null,
        submittedAt: metaById.get(row.id)?.submittedAt ?? null,
      }));
      let existing: (typeof rows)[number] | null;
      if (slot?.type === "late") {
        const late = pickLateTarget(rows, email);
        if (late.blocking) return null;
        existing = late.target;
      } else {
        existing = pickWritableRegistration(rows, email, slot?.type ?? null);
      }
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
        const meta = { slot: slot.type, feeAdult: slot.feeAdult, feeYouth: slot.feeYouth };
        await tx.registrationMeta.upsert({
          where: { year_id: { year, id } },
          create: { year, id, ...meta },
          update: {
            ...meta,
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
      return { registration, created: true };
    }),
  );
}
