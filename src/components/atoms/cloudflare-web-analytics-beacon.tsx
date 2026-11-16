"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

import { CF_WEB_ANALYTICS_SCRIPT, isAnalyticsPath } from "@/lib/analytics/cloudflare";

/** Renders the beacon only on public pages (admin and internal pages never get it). */
export function CloudflareWebAnalyticsBeacon({ config }: Readonly<{ config: string }>) {
  const pathname = usePathname();
  if (!isAnalyticsPath(pathname)) return null;
  return (
    <Script
      id="cf-web-analytics"
      src={CF_WEB_ANALYTICS_SCRIPT}
      strategy="afterInteractive"
      data-cf-beacon={config}
    />
  );
}
