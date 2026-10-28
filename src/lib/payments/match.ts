import { ENTRY_STATUS } from "@/lib/entries/status-codes";
import type { SaleMatchReason } from "@/lib/sales/core";

export type MatchReason =
  | "currency"
  | "fraction"
  | "vs_malformed"
  | "not_found"
  | "cancelled"
  /** Jen historické záznamy – platba na prázdnou přihlášku se dnes páruje jako přeplatek. */
  | "empty"
  /** Jen historické záznamy – částečné platby se dnes párují. */
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
      /** Kolik po této platbě zbývá uhradit (0 = startovné pokryto). */
      remaining: number;
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
  // Prázdná přihláška (zatím bez běžců) platbu přijme – celá částka je přeplatek,
  // který se po doplnění běžců započte do startovného.
  // Platby se sčítají (velké klubové přihlášky se plní a platí postupně).
  const total = reg.paid + tx.amount;
  const excessBefore = Math.max(0, reg.paid - reg.fee);
  return {
    kind: "matched",
    year,
    registrationId: id,
    amount: tx.amount,
    // Přeplatek ze součtu plateb; připsat jen nově vzniklou část.
    overpaid: Math.max(0, total - reg.fee) - excessBefore,
    remaining: Math.max(0, reg.fee - total),
    alreadyConfirmed,
  };
}

/** Auto-potvrzení jen u plateb s datem do 3. 12. ročníku (včetně). */
export function autoConfirmAllowed(paymentDate: string, year: number): boolean {
  return paymentDate <= `${year}-12-03`;
}

export type BankTxReason =
  | MatchReason
  | "interrupted"
  | "partial"
  | "late"
  | "already_confirmed"
  // Prodejky závodní kanceláře (#207): `sale` = spárováno na prodejku, ostatní k ruční kontrole.
  | "sale"
  | SaleMatchReason;

export const REASON_LABELS: Record<BankTxReason, string> = {
  currency: "jiná měna",
  fraction: "částka s haléři",
  vs_malformed: "chybný VS",
  not_found: "přihláška neexistuje",
  cancelled: "přihláška zrušena",
  empty: "prázdná přihláška / nulové startovné",
  underpaid: "nižší částka než k úhradě",
  interrupted: "přerušené zpracování – ověřit ručně",
  partial: "částečná platba",
  late: "platba po 3. 12. – potvrdit ručně",
  already_confirmed: "už potvrzená přihláška (možný duplikát)",
  sale: "prodejka závodní kanceláře",
  sale_not_found: "prodejka neexistuje",
  sale_amount: "jiná částka než na prodejce",
  sale_cancelled: "prodejka je stornovaná",
  sale_paid: "prodejka už je zaplacená (možný duplikát)",
};
