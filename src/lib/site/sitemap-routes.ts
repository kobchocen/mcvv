import { STAT_SLUGS } from "@/lib/stats/core";

/** Veřejné stránky v sitemapě (bez locale): homepage, výsledky, návod a statistiky (#111). */
export const SITEMAP_ROUTES: readonly string[] = [
  "",
  "/results",
  "/navod",
  "/statistiky",
  ...STAT_SLUGS.map((slug) => `/statistiky/${slug}`),
];
