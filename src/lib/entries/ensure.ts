import { prisma } from "@/lib/db/client";
import { loadAccountPromotionOptOut } from "@/lib/entries/account-promotion";
import {
  nextRegistrationId,
  pickActiveRegistration,
  retryOnUniqueViolation,
} from "@/lib/entries/ensure-core";
import { promotionValue } from "@/lib/entries/promotion";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";

export type EnsuredRegistration = {
  registration: { year: number; id: number; name: string | null; email: string | null };
  /** true = přihláška právě vznikla (první přidaný běžec). */
  created: boolean;
};

/**
 * Vrátí aktivní přihlášku e-mailu v ročníku, nebo ji založí (číslo = max + 1 v ročníku).
 * Volá se jen při přidání prvního běžce – návštěva stránky ani přihlášení nic nezakládá.
 * Hledání a založení běží v transakci; kolize čísla (souběh, P2002) se zopakuje.
 */
export async function ensureRegistration(
  year: number,
  email: string,
  displayName: string,
): Promise<EnsuredRegistration> {
  // Legacy sloupec `promotion` se plní ze souhlasu na účtu (newsletter už čte účet).
  const promotion = promotionValue(await loadAccountPromotionOptOut(email));
  return retryOnUniqueViolation(() =>
    prisma.$transaction(async (tx) => {
      const yearRows = await tx.registration.findMany({
        where: { year },
        select: { year: true, id: true, name: true, email: true, status: true },
      });
      const existing = pickActiveRegistration(yearRows, email);
      if (existing) {
        return { registration: existing, created: false };
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
      return { registration, created: true };
    }),
  );
}
