import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: "/api/test/fotka",
      },
      {
        pathname: "/images/**",
      },
      {
        pathname: "/illustrations/**",
      },
    ],
  },
  /* config options here */
};

export default withNextIntl(nextConfig);
