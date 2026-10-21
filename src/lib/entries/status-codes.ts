/**
 * Stavy přihlášky (`mcvv_prihlaska.stav`). Legacy web používal pro potvrzenou přihlášku `9`;
 * migrace `20261021220000_registration_status_9_to_5` ji převedla na `confirmed` (5), takže
 * jiné hodnoty než 0–5 už v datech nejsou (null zůstává pro neznámý stav).
 */
export const ENTRY_STATUS = {
  cancelled: 0,
  empty: 1,
  unpaid: 2,
  paid: 3,
  overpaid: 4,
  confirmed: 5,
} as const;

export type EntryStatus = (typeof ENTRY_STATUS)[keyof typeof ENTRY_STATUS];
