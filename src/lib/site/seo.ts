import { locales, type Locale } from "@/i18n/routing";
import { siteLocale } from "@/lib/i18n/locale";

/** Site name used in Open Graph metadata; a proper noun, never translated. */
export const SITE_NAME = "Malá cena Velké Verandy";

/** Default meta description per locale (#273). cs is the long-standing text. */
const SITE_DESCRIPTIONS: Record<Locale, string> = {
  cs: "Tradiční zimní lesní kros v Chocni.",
  en: "A traditional winter forest cross-country race in Choceň.",
  de: "Traditioneller winterlicher Waldcrosslauf in Choceň.",
  pl: "Tradycyjny zimowy leśny bieg przełajowy w mieście Choceň.",
  uk: "Традиційний зимовий лісовий крос у місті Choceň.",
};

/** Open Graph locale codes (language_TERRITORY). */
const OG_LOCALES: Record<Locale, string> = {
  cs: "cs_CZ",
  en: "en_GB",
  de: "de_DE",
  pl: "pl_PL",
  uk: "uk_UA",
};

export function siteDescription(locale: string): string {
  return SITE_DESCRIPTIONS[siteLocale(locale)];
}

export function ogLocale(locale: string): string {
  return OG_LOCALES[siteLocale(locale)];
}

/** OG locales of the other language versions. */
export function ogAlternateLocales(locale: string): string[] {
  const current = siteLocale(locale);
  return locales.filter((l) => l !== current).map((l) => OG_LOCALES[l]);
}

/**
 * hreflang alternates for a locale-less route ("" = homepage, "/results", ...):
 * every locale plus x-default pointing at the Czech original.
 */
export function languageAlternates(base: string, route: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of locales) out[l] = `${base}/${l}${route}`;
  out["x-default"] = `${base}/cs${route}`;
  return out;
}
