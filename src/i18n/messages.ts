/**
 * Message loading with fallback (#273).
 *
 * cs and en are complete. de, pl and uk are machine translations of the public web only;
 * every namespace they do not contain (admin, race-day staff screens, receipts, …) falls
 * back to English, key by key.
 */

/** Locales whose message file contains only the public namespaces. */
export const PARTIAL_LOCALES = ["de", "pl", "uk"] as const;
export type PartialLocale = (typeof PARTIAL_LOCALES)[number];

/** Locale whose messages fill gaps in the partial locales. */
export const FALLBACK_LOCALE = "en" as const;

export function isPartialLocale(locale: string): locale is PartialLocale {
  return (PARTIAL_LOCALES as readonly string[]).includes(locale);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep merge: values from `override` win; objects merge recursively; arrays are replaced. */
export function mergeMessages<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] =
      isPlainObject(current) && isPlainObject(value) ? mergeMessages(current, value) : value;
  }
  return result as T;
}

async function importLocale(locale: string): Promise<Record<string, unknown>> {
  return (await import(`./locales/${locale}/common.json`)).default as Record<string, unknown>;
}

export async function loadMessages(locale: string): Promise<Record<string, unknown>> {
  const own = await importLocale(locale);
  if (!isPartialLocale(locale)) return own;
  return mergeMessages(await importLocale(FALLBACK_LOCALE), own);
}
