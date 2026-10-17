import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
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
