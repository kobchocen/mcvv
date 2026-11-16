/**
 * Cloudflare Web Analytics (cookieless JS beacon, manual setup).
 * The beacon token comes from the runtime env CF_WEB_ANALYTICS_BEACON; without a valid
 * value nothing is rendered. Origins are mirrored in the CSP (src/lib/security/headers.ts).
 */

export const CF_WEB_ANALYTICS_SCRIPT = "https://static.cloudflareinsights.com/beacon.min.js";

/** Site tokens from the Cloudflare dashboard are short alphanumeric strings (32 hex today). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** `data-cf-beacon` attribute value, or null when the token is missing or malformed. */
export function cloudflareBeaconConfig(token: string | undefined): string | null {
  const value = token?.trim();
  if (!value || !TOKEN_PATTERN.test(value)) return null;
  return JSON.stringify({ token: value });
}
