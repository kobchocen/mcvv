import { MetadataRoute } from "next";

import { locales } from "@/i18n/routing";
import { SITEMAP_ROUTES } from "@/lib/site/sitemap-routes";
import { siteUrl } from "@/lib/site/url";

// Read SITE_URL at request time (runtime env on Azure), not at build time.
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const entries: MetadataRoute.Sitemap = [];

  locales.forEach((locale) => {
    SITEMAP_ROUTES.forEach((route) => {
      entries.push({
        url: `${base}/${locale}${route}`,
        lastModified: new Date(),
        changeFrequency: route === "" ? "weekly" : "monthly",
        priority: route === "" ? 1 : 0.8,
      });
    });
  });

  // Add dynamic year results if desired; for now static is sufficient.
  // If years needed, they can be fetched at build time.

  return entries;
}
