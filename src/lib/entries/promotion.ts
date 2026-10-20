/**
 * `mcvv_prihlaska.promotion`: legacy free-text column with a single meaning.
 * `N` (any case, surrounding spaces ignored) = the registrant opted out of
 * newsletters / marketing e-mails; NULL or empty = e-mails allowed.
 */
export function isPromotionOptOut(value: string | null | undefined): boolean {
  return (value ?? "").trim().toUpperCase() === "N";
}

/** Value to store for the "no newsletter" checkbox: checked → `N`, unchecked → NULL. */
export function promotionValue(optOut: boolean): "N" | null {
  return optOut ? "N" : null;
}
