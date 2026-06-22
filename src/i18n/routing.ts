import { createNavigation } from "next-intl/navigation";

import routingConfig from "@/next-intl.config";

export const routing = routingConfig;
export const locales = routing.locales;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = routing.defaultLocale;
export const localePrefix = routing.localePrefix ?? "always";

export const localeLabels: Record<Locale, string> = {
  en: "English",
  cs: "Čeština",
};

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);
