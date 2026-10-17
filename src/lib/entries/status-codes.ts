export const ENTRY_STATUS = {
  cancelled: 0,
  empty: 1,
  unpaid: 2,
  paid: 3,
  overpaid: 4,
  confirmed: 5,
} as const;

export type EntryStatus = (typeof ENTRY_STATUS)[keyof typeof ENTRY_STATUS];
