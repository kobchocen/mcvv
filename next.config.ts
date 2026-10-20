import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

import { securityHeaders } from "./src/lib/security/headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // PDF doklad a tiskové sestavy čtou přibalené fonty z disku (src/lib/receipts/fonts.ts).
  outputFileTracingIncludes: {
    "/api/prihlasky/[rok]/[id]/doklad": ["./src/assets/fonts/*.ttf"],
    "/api/admin/tisk/cisla": ["./src/assets/fonts/*.ttf"],
    "/api/statistiky/[slug]/pdf": ["./src/assets/fonts/*.ttf"],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({ dev: process.env.NODE_ENV === "development" }),
      },
    ];
  },
  images: {
    // /api/fotka blobs are immutable per id; keep optimized variants for 30 days.
    minimumCacheTTL: 2592000,
    localPatterns: [
      {
        pathname: "/api/fotka",
      },
      {
        pathname: "/api/test/fotka",
      },
      {
        pathname: "/navod/**",
      },
      {
        pathname: "/images/**",
      },
      {
        pathname: "/illustrations/**",
      },
      {
        pathname: "/partners/**",
      },
    ],
  },
  /* config options here */
};

export default withNextIntl(nextConfig);
