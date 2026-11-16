/**
 * Cloudflare Web Analytics (cookieless JS beacon, manual setup).
 * The beacon token comes from the runtime env CF_WEB_ANALYTICS_BEACON; without a valid
 * value nothing is rendered. Origins are mirrored in the CSP (src/lib/security/headers.ts).
 *
 * Only public pages are measured: the beacon is rendered just on an allowlist of public
 * sections (`isAnalyticsPath`), so administration, the office, race-day tools, messages and
 * account/login flows are never measured — and new sections stay unmeasured until listed.
 * SPA tracking is off (`spa: false`): a beacon loaded on a public page would otherwise
 * report a later client-side navigation into administration. Each full page load is
 * reported with the URL it was loaded with.
 */

export const CF_WEB_ANALYTICS_SCRIPT = "https://static.cloudflareinsights.com/beacon.min.js";

/** Site tokens from the Cloudflare dashboard are short alphanumeric strings (32 hex today). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** First path segment after the locale of the public sections ("" = homepage). */
export const ANALYTICS_PUBLIC_SECTIONS: readonly string[] = [
  "",
  "bezec",
  "fotogalerie",
  "kluby",
  "kontakt",
  "navod",
  "pokyny",
  "prihlasky",
  "program",
  "results",
  "startovka",
  "statistiky",
  "vysledky",
];

const LOCALE_PATH = /^\/(?:cs|en|de|pl|uk)(?:\/([^/?#]*))?/;

/** True for a public page (`/cs`, `/en/results/2025` …); false for admin and internal pages. */
export function isAnalyticsPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const match = LOCALE_PATH.exec(pathname);
  if (!match) return false;
  const rest = pathname.slice(match[0].length);
  if (rest !== "" && !rest.startsWith("/") && !rest.startsWith("?") && !rest.startsWith("#")) {
    return false;
  }
  return ANALYTICS_PUBLIC_SECTIONS.includes(match[1] ?? "");
}

/** `data-cf-beacon` attribute value, or null when the token is missing or malformed. */
export function cloudflareBeaconConfig(token: string | undefined): string | null {
  const value = token?.trim();
  if (!value || !TOKEN_PATTERN.test(value)) return null;
  return JSON.stringify({ token: value, spa: false });
}
