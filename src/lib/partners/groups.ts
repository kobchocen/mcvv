/**
 * Homepage partner groups by `sponsors.category`: 1 = hlavní partneři,
 * 2 = partneři, 3 = ceny pro nejlepší. Unknown categories fall back to the
 * regular partners group so an active partner never disappears from the web.
 */
export const PARTNER_GROUP_KEYS = ["main", "partners", "prizes"] as const;

export type PartnerGroupKey = (typeof PARTNER_GROUP_KEYS)[number];

export function partnerGroupKey(category: number | null | undefined): PartnerGroupKey {
  if (category === 1) {
    return "main";
  }
  if (category === 3) {
    return "prizes";
  }
  return "partners";
}

/** Split already ordered partners into non-empty groups, keeping their order. */
export function groupPartners<T extends { category?: number | null }>(
  items: readonly T[],
): { key: PartnerGroupKey; items: T[] }[] {
  return PARTNER_GROUP_KEYS.map((key) => ({
    key,
    items: items.filter((item) => partnerGroupKey(item.category) === key),
  })).filter((group) => group.items.length > 0);
}
