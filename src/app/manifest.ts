import type { MetadataRoute } from "next";

import { SITE_NAME, siteDescription } from "@/lib/site/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "MCVV",
    description: siteDescription("cs"),
    start_url: "/cs",
    display: "standalone",
    background_color: "#031106",
    theme_color: "#07210e",
    icons: [
      {
        src: "/icons/mcvv-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/mcvv-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
