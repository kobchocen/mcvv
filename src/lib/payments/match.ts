import { ENTRY_STATUS } from "@/lib/entries/status-codes";

export type MatchReason =
  | "currency"
  | "fraction"
  | "vs_malformed"
  | "not_found"
  | "cancelled"
  | "empty"
  | "underpaid";

export type RegistrationSnapshot = { status: number | null; fee: number; paid: number } | null;

export type MatchDecision =
  | { kind: "skip" }
  | { kind: "unmatched"; reason: MatchReason; year: number; registrationId: number | null }
  | {
      kind: "matched";
      year: number;
      registrationId: number;
      amount: number;
      overpaid: number;
      /** Přihláška už byla potvrzená → jen zapsat, nic neposílat (možný duplikát). */
      alreadyConfirmed: boolean;
    };

/** Jen příchozí platby s VS začínajícím aktuálním ročníkem; ostatní provoz klubu ignorujeme. */
export function isRaceTransaction(
  tx: { amount: number; vs: string | null },
  year: number,
): boolean {
  return tx.amount > 0 && Boolean(tx.vs?.trim().startsWith(String(year)));
}

/** VS = rok + číslo přihlášky bez úvodních nul (viz variableSymbol). */
export function parseVs(vs: string, year: number): number | null {
  const m = /^(\d{4})([1-9]\d{0,3})$/.exec(vs.trim());
  if (!m || Number(m[1]) !== year) return null;
  return Number(m[2]);
}

export function matchTransaction(
  tx: { amount: number; currency: string; vs: string | null },
  year: number,
  registration: (id: number) => RegistrationSnapshot,
): MatchDecision {
  if (!isRaceTransaction(tx, year)) return { kind: "skip" };
  if (tx.currency !== "CZK")
    return { kind: "unmatched", reason: "currency", year, registrationId: null };
  const id = parseVs(tx.vs!, year);
  if (id === null) return { kind: "unmatched", reason: "vs_malformed", year, registrationId: null };
  if (!Number.isInteger(tx.amount))
    return { kind: "unmatched", reason: "fraction", year, registrationId: id };
  const reg = registration(id);
  if (!reg) return { kind: "unmatched", reason: "not_found", year, registrationId: id };
  if (reg.status === ENTRY_STATUS.cancelled)
    return { kind: "unmatched", reason: "cancelled", year, registrationId: id };
  const alreadyConfirmed = reg.status === ENTRY_STATUS.confirmed;
  if (!alreadyConfirmed && (reg.status === ENTRY_STATUS.empty || reg.fee <= 0)) {
    return { kind: "unmatched", reason: "empty", year, registrationId: id };
  }
  const outstanding = Math.max(0, reg.fee - reg.paid);
  if (!alreadyConfirmed && tx.amount < outstanding) {
    return { kind: "unmatched", reason: "underpaid", year, registrationId: id };
  }
  return {
    kind: "matched",
    year,
    registrationId: id,
    amount: tx.amount,
    overpaid: tx.amount - outstanding,
    alreadyConfirmed,
  };
}

/** Auto-potvrzení jen u plateb s datem do 3. 12. ročníku (včetně). */
export function autoConfirmAllowed(paymentDate: string, year: number): boolean {
  return paymentDate <= `${year}-12-03`;
}

export const REASON_LABELS: Record<MatchReason | "interrupted", string> = {
  currency: "jiná měna",
  fraction: "částka s haléři",
  vs_malformed: "chybný VS",
  not_found: "přihláška neexistuje",
  cancelled: "přihláška zrušena",
  empty: "prázdná přihláška / nulové startovné",
  underpaid: "nižší částka než k úhradě",
  interrupted: "přerušené zpracování – ověřit ručně",
};
