/**
 * Startovné přihlášky – jediné pravidlo pro součet (čisté funkce, bez DB).
 *
 * Řádek bere uložené `entryFee`; když chybí (null), použije se startovné kategorie.
 * Tak to počítá stránka „Moje přihlášky“ i seznam platných přihlášek
 * (`validRegistrationIds`). Uložená 0 Kč (pořadatel, vítěz, veterán) zůstává 0.
 */
export type FeeLine = {
  entryFee: number | null | undefined;
  category?: { entryFee: number | null | undefined } | null;
};

export function lineFee(line: FeeLine): number {
  return line.entryFee ?? line.category?.entryFee ?? 0;
}

export function registrationFee(lines: readonly FeeLine[]): number {
  return lines.reduce((sum, line) => sum + lineFee(line), 0);
}

export function sumPayments(payments: readonly { amount: number | null | undefined }[]): number {
  return payments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
}
