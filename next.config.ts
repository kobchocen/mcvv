import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    localPatterns: [
      {
        pathname: "/api/fotka",
      },
      {
        pathname: "/api/test/fotka",
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
