export const locales = ["cs", "en", "de", "pl", "uk"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "cs";
