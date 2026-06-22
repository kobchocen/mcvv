import createMiddleware from "next-intl/middleware";

import { defaultLocale, locales, localePrefix } from "./src/i18n/routing";

const intlProxy = createMiddleware({
  defaultLocale,
  locales,
  localePrefix,
});

export default intlProxy;

export const config = {
  matcher: ["/", "/(en|cs)/:path*"],
};
