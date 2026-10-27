import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site/url";

export const dynamic = "force-dynamic";

function isNonIndexableEnv(appEnv: string | undefined): boolean {
  const value = (appEnv ?? "").trim().toLowerCase();
  return value === "stg" || value === "staging";
}

/**
 * URL variants that are duplicates for crawlers (#199): runner profiles take no query
 * parameters, and search / sort variants of the club list and the start list only reorder
 * or filter pages that are crawlable without them (club list paging `strana` stays allowed).
 */
const CRAWL_DISALLOW = [
  "/*/bezec/*?",
  "/*/kluby?*q=",
  "/*/kluby?*razeni=",
  "/*/startovka?*q=",
  "/*/startovka?*kat=",
];

/** Crawlers that honour Crawl-delay (Bing, Yandex, Seznam…) wait this many seconds. */
const CRAWL_DELAY_SECONDS = 2;

export default function robots(): MetadataRoute.Robots {
  if (isNonIndexableEnv(process.env.APP_ENV)) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: CRAWL_DISALLOW,
      crawlDelay: CRAWL_DELAY_SECONDS,
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
