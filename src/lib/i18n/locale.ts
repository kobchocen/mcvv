/**
 * Locale helpers shared by pages, e-mails and PDFs (#273).
 *
 * The public web runs in cs, en, de, pl and uk. E-mails, PDFs and receipts exist only in
 * Czech and English: Czech stays Czech, every other supported locale gets English.
 */
import { defaultLocale, locales, type Locale } from "./config";

export type DocumentLocale = "cs" | "en";

export function isLocale(raw: unknown): raw is Locale {
  return typeof raw === "string" && (locales as readonly string[]).includes(raw);
}

/** Supported web locale, otherwise the default (cs). Use for URLs and redirects. */
export function siteLocale(raw: unknown): Locale {
  return isLocale(raw) ? raw : defaultLocale;
}

/** Language of e-mails, PDFs and receipts: cs for Czech (and unknown input), en otherwise. */
export function documentLocale(raw: unknown): DocumentLocale {
  return isLocale(raw) && raw !== "cs" ? "en" : "cs";
}

/**
 * Language of staff documents (admin print-outs, start-list PDF): English for en, Czech for
 * everything else – staff screens in de/pl/uk are Czech-only (Q430).
 */
export function staffLocale(raw: unknown): DocumentLocale {
  return raw === "en" ? "en" : "cs";
}

/** BCP 47 tag for Intl formatting of a web locale. */
export const INTL_TAG: Record<Locale, string> = {
  cs: "cs-CZ",
  en: "en-GB",
  de: "de-DE",
  pl: "pl-PL",
  uk: "uk-UA",
};

export function intlTag(locale: string): string {
  return INTL_TAG[siteLocale(locale)];
}
