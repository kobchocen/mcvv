import { getRequestConfig } from "next-intl/server";

import routing from "@/next-intl.config";

type Locale = (typeof routing.locales)[number];

function normalizeLocale(input?: string): Locale {
  if (input && routing.locales.includes(input as Locale)) {
    return input as Locale;
  }
  return routing.defaultLocale;
}

export default getRequestConfig(async ({ locale }) => {
  const resolvedLocale = normalizeLocale(locale);

  return {
    locale: resolvedLocale,
    messages: (await import(`./locales/${resolvedLocale}/common.json`)).default,
  };
});
