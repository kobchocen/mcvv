import { STAT_SLUGS } from "@/lib/stats/core";

/** Veřejné stránky v sitemapě (bez locale): homepage, výsledky, návod, statistiky (#111) a kluby. */
export const SITEMAP_ROUTES: readonly string[] = [
  "",
  "/results",
  "/navod",
  "/statistiky",
  ...STAT_SLUGS.map((slug) => `/statistiky/${slug}`),
  "/kluby",
];
