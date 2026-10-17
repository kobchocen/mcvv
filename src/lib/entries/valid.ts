import { ENTRY_STATUS } from "@/lib/entries/status-codes";

/**
 * Single rule for "a runner is registered" (homepage count, public entrants list):
 * the application is not cancelled, has runners, and is either confirmed by the
 * organizer or fully paid. A total fee of 0 Kč counts as paid (organizer, winners,
 * veterans) – the same case the payment box shows as "není co hradit".
 */
export function isEntryValid(entry: {
  status: number | null | undefined;
  lineCount: number;
  fee: number;
  paid: number;
}): boolean {
  if (entry.status === ENTRY_STATUS.cancelled || entry.lineCount === 0) {
    return false;
  }
  if (entry.status === ENTRY_STATUS.confirmed) {
    return true;
  }
  return entry.paid >= entry.fee;
}
