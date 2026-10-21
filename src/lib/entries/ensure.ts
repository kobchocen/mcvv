import { prisma } from "@/lib/db/client";
import {
  emailEquals,
  inheritedPromotion,
  nextRegistrationId,
  pickActiveRegistration,
  retryOnUniqueViolation,
} from "@/lib/entries/ensure-core";
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
      const history = await tx.registration.findMany({
        where: { email: { equals: email } },
        select: { year: true, id: true, created: true, promotion: true, email: true },
      });
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
          promotion: inheritedPromotion(history.filter((row) => emailEquals(row.email, email))),
        },
        select: { year: true, id: true, name: true, email: true },
      });
      return { registration, created: true };
    }),
  );
}
