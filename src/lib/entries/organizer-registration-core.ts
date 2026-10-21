/**
 * Přihláška pořadatelů = přihláška č. 1 ročníku (startovka: čísla od 1 a od 601).
 * Dřív ji dostal ten, kdo po založení ročníku první otevřel /prihlasky; teď ji zakládá
 * uložení ročníku v administraci na e-mail z nastavení (čisté funkce, bez DB).
 */
import { parseEmail } from "@/lib/settings/messages-core";

export const ORGANIZER_REGISTRATION_NUMBER = 1;
export const ORGANIZER_REGISTRATION_EMAIL_KEY = "organizer_registration_email";
export const DEFAULT_ORGANIZER_REGISTRATION_EMAIL = "pavel.svadlena@kobchocen.cz";
export const ORGANIZER_REGISTRATION_NAME = "K.O.B. Choceň";

/** E-mail přihlášky pořadatelů: uložené nastavení, jinak výchozí adresa. */
export function resolveOrganizerRegistrationEmail(stored: string | null | undefined): string {
  return parseEmail(stored) ?? DEFAULT_ORGANIZER_REGISTRATION_EMAIL;
}

export type OrganizerRegistrationPlan =
  | { action: "create" }
  /** Přihláška č. 1 už existuje (komukoli) – nic se nemění. */
  | { action: "exists" }
  /** E-mail už má v ročníku jinou aktivní přihlášku – druhou nezakládat. */
  | { action: "has_other"; id: number };

export function planOrganizerRegistration(
  rows: readonly { id: number; email: string | null; status: number | null }[],
  email: string,
): OrganizerRegistrationPlan {
  if (rows.some((row) => row.id === ORGANIZER_REGISTRATION_NUMBER)) {
    return { action: "exists" };
  }
  const own = rows
    .filter(
      (row) =>
        (row.email ?? "").trim().toLowerCase() === email.trim().toLowerCase() && row.status !== 0,
    )
    .sort((a, b) => a.id - b.id)[0];
  if (own) {
    return { action: "has_other", id: own.id };
  }
  return { action: "create" };
}
