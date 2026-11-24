/**
 * Formatting and tone helpers for the admin entry list (Administrace → Přihlášky a platby).
 * Pure functions so the list layout stays testable without a database.
 */
import { ENTRY_STATUS } from "@/lib/entries/status-codes";
import { intlTag } from "@/lib/i18n/locale";

const MINUS = "\u2212";

/**
 * Whole-crown amount with thousands grouping: cs "1 200 Kč", en "CZK 1,200".
 * `signed` adds an explicit sign for differences: cs "−200 Kč" / "+100 Kč".
 */
export function formatListAmount(
  value: number,
  locale: string,
  { signed = false }: { signed?: boolean } = {},
): string {
  const tag = locale === "en" ? "en-GB" : intlTag("cs");
  const digits = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(Math.abs(value));
  const sign = value < 0 ? MINUS : signed && value > 0 ? "+" : "";
  return locale === "en" ? `${sign}CZK\u00a0${digits}` : `${sign}${digits}\u00a0Kč`;
}

export type PaymentDiffTone = "even" | "short" | "over";

/** paid − fee: below zero something is missing, above zero it is an overpayment. */
export function paymentDiffTone(diff: number): PaymentDiffTone {
  if (diff < 0) return "short";
  if (diff > 0) return "over";
  return "even";
}

export type EntryStatusTone =
  "cancelled" | "empty" | "unpaid" | "paid" | "overpaid" | "confirmed" | "unknown";

/**
 * Badge tone of an entry status: confirmed = done (green), paid = waiting for the organiser's
 * confirmation (accent), unpaid = red, overpaid = amber, new/cancelled = neutral.
 */
export function entryStatusTone(status: number | null | undefined): EntryStatusTone {
  switch (status) {
    case ENTRY_STATUS.cancelled:
      return "cancelled";
    case ENTRY_STATUS.empty:
      return "empty";
    case ENTRY_STATUS.unpaid:
      return "unpaid";
    case ENTRY_STATUS.paid:
      return "paid";
    case ENTRY_STATUS.overpaid:
      return "overpaid";
    case ENTRY_STATUS.confirmed:
      return "confirmed";
    default:
      return "unknown";
  }
}
