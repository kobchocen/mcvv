import Script from "next/script";

import { CF_WEB_ANALYTICS_SCRIPT, cloudflareBeaconConfig } from "@/lib/analytics/cloudflare";
import { env } from "@/lib/env";

/**
 * Cookieless Cloudflare Web Analytics beacon. Reads the token at request time (all
 * locale pages render dynamically), so it can be set in the Container App without a rebuild.
 */
export function CloudflareWebAnalytics() {
  const config = cloudflareBeaconConfig(env.CF_WEB_ANALYTICS_BEACON);
  if (!config) return null;
  return (
    <Script
      id="cf-web-analytics"
      src={CF_WEB_ANALYTICS_SCRIPT}
      strategy="afterInteractive"
      data-cf-beacon={config}
    />
  );
}
