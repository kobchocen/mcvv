import { CloudflareWebAnalyticsBeacon } from "@/components/atoms/cloudflare-web-analytics-beacon";
import { cloudflareBeaconConfig } from "@/lib/analytics/cloudflare";
import { env } from "@/lib/env";

/**
 * Cookieless Cloudflare Web Analytics. Reads the token at request time (all locale pages
 * render dynamically), so it can be set in the Container App without a rebuild; the beacon
 * itself decides per path whether the page is public (see isAnalyticsPath).
 */
export function CloudflareWebAnalytics() {
  const config = cloudflareBeaconConfig(env.CF_WEB_ANALYTICS_BEACON);
  if (!config) return null;
  return <CloudflareWebAnalyticsBeacon config={config} />;
}
