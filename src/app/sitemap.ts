import { MetadataRoute } from "next";

import { locales } from "@/i18n/routing";

const BASE_URL = "https://mcvv.cz"; // update if real domain differs

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/results"];

  const entries: MetadataRoute.Sitemap = [];

  locales.forEach((locale) => {
    routes.forEach((route) => {
      entries.push({
        url: `${BASE_URL}/${locale}${route}`,
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
