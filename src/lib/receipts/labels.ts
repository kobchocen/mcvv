import cs from "@/i18n/locales/cs/common.json";
import en from "@/i18n/locales/en/common.json";

import type { ReceiptLocale } from "./receipt-core";

export type ReceiptLabelKey = keyof typeof cs.Receipt;
export type ReceiptTranslate = (
  key: ReceiptLabelKey,
  values?: Record<string, string | number>,
) => string;

const MESSAGES: Record<ReceiptLocale, Record<string, string>> = {
  cs: cs.Receipt,
  en: en.Receipt,
};

/**
 * Texty PDF dokladu ze sekce „Receipt“ v common.json. Jednoduché {placeholdery} –
 * route handler i skript pro ukázkový PDF tak nepotřebují next-intl request kontext.
 */
export function receiptTranslator(locale: ReceiptLocale): ReceiptTranslate {
  const messages = MESSAGES[locale];
  return (key, values = {}) =>
    (messages[key] ?? cs.Receipt[key]).replace(/\{(\w+)\}/g, (match, name: string) =>
      name in values ? String(values[name]) : match,
    );
}
