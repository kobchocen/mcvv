/**
 * Líné zakládání přihlášky (čisté funkce, bez DB).
 *
 * Účet (`mcvv_user`) je jen účet. Přihláška ročníku (`mcvv_prihlaska`) vzniká až ve chvíli,
 * kdy přihlašující přidá prvního běžce. Číslo přihlášky = nejvyšší číslo v ročníku + 1
 * (stejně jako legacy `prihlasit.php`); souběh dvou zakládání řeší opakování po P2002.
 */
import { ENTRY_STATUS } from "@/lib/entries/status-codes";

/** Další volné číslo přihlášky v ročníku (první přihláška ročníku má číslo 1). */
export function nextRegistrationId(maxId: number | null | undefined): number {
  return Math.max(0, maxId ?? 0) + 1;
}

export function emailEquals(value: string | null | undefined, email: string): boolean {
  return (value ?? "").trim().toLowerCase() === email.trim().toLowerCase();
}

export function isCancelledStatus(status: number | null | undefined): boolean {
  return status === ENTRY_STATUS.cancelled;
}

/**
 * Aktivní (nezrušená) přihláška daného e-mailu v ročníku; při více kandidátech ta s nejnižším
 * číslem. Zrušené přihlášky se ignorují, takže po zrušení pořadatelem lze založit novou.
 */
export function pickActiveRegistration<
  T extends { id: number; email: string | null; status: number | null },
>(rows: readonly T[], email: string): T | null {
  const mine = rows
    .filter((row) => emailEquals(row.email, email) && !isCancelledStatus(row.status))
    .sort((a, b) => a.id - b.id);
  return mine[0] ?? null;
}

/** Zrušené přihlášky daného e-mailu v ročníku (jen pro informaci přihlašujícímu). */
export function pickCancelledRegistrations<
  T extends { id: number; email: string | null; status: number | null },
>(rows: readonly T[], email: string): T[] {
  return rows
    .filter((row) => emailEquals(row.email, email) && isCancelledStatus(row.status))
    .sort((a, b) => a.id - b.id);
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** Spustí `run`, a pokud skončí kolizí unikátního klíče (P2002), zkusí to znovu. */
export async function retryOnUniqueViolation<T>(run: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError;
}
