import { createNavigation } from "next-intl/navigation";

import routingConfig from "@/next-intl.config";

export const routing = routingConfig;
export const locales = routing.locales;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = routing.defaultLocale;
export const localePrefix = routing.localePrefix ?? "always";

/** Native language names shown in the language switcher. */
export const localeLabels: Record<Locale, string> = {
  cs: "Čeština",
  en: "English",
  de: "Deutsch",
  pl: "Polski",
  uk: "Українська",
};

/** Short codes shown on the switcher button (UA for Ukrainian, as users expect, not the ISO "UK"). */
export const localeCodes: Record<Locale, string> = {
  cs: "CZ",
  en: "EN",
  de: "DE",
  pl: "PL",
  uk: "UA",
};

/**
 * Flag (country code in `public/flags/4x3`) shown next to each language in the switcher (Q436).
 * English uses the UK flag, Ukrainian the flag of Ukraine.
 */
export const localeFlags: Record<Locale, string> = {
  cs: "CZ",
  en: "GB",
  de: "DE",
  pl: "PL",
  uk: "UA",
};

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
