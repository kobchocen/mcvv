import { prisma } from "@/lib/db/client";
import { emailEquals } from "@/lib/entries/ensure-core";

/**
 * Skrytí běžci rychlé nabídky (MD-31, `mcvv_user_quick_hidden`). Skrytí je jen preference
 * účtu: nikdy nemaže přihlášky, výsledky ani běžce.
 */

/**
 * Patří běžec do nabídky účtu? Skrýt lze jen běžce z vlastní přihlášky (stejný e-mail
 * jako účet, kterýkoli ročník) – jinak by šlo zkoušet cizí id.
 */
export async function runnerInOwnEntries(email: string, runnerId: string): Promise<boolean> {
  const lines = await prisma.registrationLine.findMany({
    where: { runnerId },
    select: { registration: { select: { email: true } } },
  });
  return lines.some((line) => emailEquals(line.registration.email, email));
}
