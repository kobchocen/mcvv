import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site/url";

export const dynamic = "force-dynamic";

function isNonIndexableEnv(appEnv: string | undefined): boolean {
  const value = (appEnv ?? "").trim().toLowerCase();
  return value === "stg" || value === "staging";
}

export default function robots(): MetadataRoute.Robots {
  if (isNonIndexableEnv(process.env.APP_ENV)) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
