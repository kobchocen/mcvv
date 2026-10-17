import routingConfig from "@/next-intl.config";

const LOCALES: readonly string[] = routingConfig.locales;
const DEFAULT_LOCALE = routingConfig.defaultLocale;

/** First path segments of all localized pages (e.g. "registrace", "prihlasky", "admin"). */
const KNOWN_SEGMENTS = new Set(
  Object.keys(routingConfig.pathnames ?? {})
    .map((pathname) => pathname.split("/")[1] ?? "")
    .filter((segment) => segment && !segment.startsWith("[")),
);

/**
 * For a page path without a locale prefix (e.g. "/registrace?next=/prihlasky"), return the
 * default-locale URL ("/cs/registrace?next=/prihlasky"). Returns null when no redirect applies.
 */
export function localeRedirectTarget(pathname: string, search: string): string | null {
  const segment = pathname.split("/")[1] ?? "";
  if (!segment || LOCALES.includes(segment) || !KNOWN_SEGMENTS.has(segment)) {
    return null;
  }
  const trimmed = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return `/${DEFAULT_LOCALE}${trimmed}${search}`;
}
