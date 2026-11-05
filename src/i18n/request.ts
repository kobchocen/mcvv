import { getRequestConfig } from "next-intl/server";

import routing from "@/next-intl.config";

import { loadMessages } from "./messages";

type Locale = (typeof routing.locales)[number];

function normalizeLocale(input?: string): Locale {
  if (input && routing.locales.includes(input as Locale)) {
    return input as Locale;
  }
  return routing.defaultLocale;
}

export default getRequestConfig(async ({ locale, requestLocale }) => {
  const resolvedLocale = normalizeLocale(locale ?? (await requestLocale));

  return {
    locale: resolvedLocale,
    messages: await loadMessages(resolvedLocale),
  };
});
