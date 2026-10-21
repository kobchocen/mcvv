import { createTranslator } from "next-intl";

import cs from "@/i18n/locales/cs/common.json";
import en from "@/i18n/locales/en/common.json";

import type { PresentationBlock } from "./presentation-core";
import type { PresentationPdfLabels } from "./presentation-pdf";

export type PrintLocale = "cs" | "en";
export type PresentationReport = "presentation" | "alphabet";

const NUMBER: Record<PrintLocale, string> = { cs: "cs-CZ", en: "en-GB" };

/** Texty sestav prezentace ze sekce „PrintReports“ v common.json (bez next-intl kontextu). */
export function presentationPdfLabels(
  locale: PrintLocale,
  report: PresentationReport,
  input: {
    year: number;
    generatedAt: Date;
    totals: { registrations: number; runners: number; fee: number; due: number };
  },
): PresentationPdfLabels {
  const messages = locale === "en" ? en : cs;
  const t = createTranslator({ locale, messages, namespace: "PrintReports" });
  const startList = createTranslator({ locale, messages, namespace: "StartList" });
  const number = new Intl.NumberFormat(NUMBER[locale]);
  const money = (amount: number) => number.format(amount);
  const generated = new Intl.DateTimeFormat(NUMBER[locale], {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Prague",
  }).format(input.generatedAt);
  const presentation = report === "presentation";
  return {
    brand: `${messages.Home.brand.top} ${messages.Home.brand.bottom}`,
    title: presentation
      ? t("pdfPresentationTitle", { year: input.year })
      : t("pdfAlphabetTitle", { year: input.year }),
    subtitle: presentation ? t("pdfPresentationSubtitle") : t("pdfAlphabetSubtitle"),
    summary: presentation
      ? t("pdfSummary", {
          registrations: input.totals.registrations,
          runners: input.totals.runners,
          fee: money(input.totals.fee),
          due: money(input.totals.due),
        })
      : t("pdfAlphabetSummary", { runners: input.totals.runners }),
    colBib: t("colBib"),
    colTime: t("colTime"),
    colName: t("colName"),
    colBirth: t("colBirth"),
    colClub: t("colClub"),
    colCategory: presentation ? t("colCategory") : t("colCategoryShort"),
    colFee: t("colFee"),
    colRegistration: t("colRegistration"),
    registration: (label) => t("registration", { label }),
    blockTotal: (block: PresentationBlock) =>
      t("blockTotal", {
        runners: t("runners", { count: block.rows.length }),
        fee: money(block.fee),
        paid: money(block.paid),
      }),
    due: (amount) => t("due", { amount: money(amount) }),
    settled: t("settled"),
    overpaid: (amount) => t("overpaid", { amount: money(amount) }),
    currency: (amount) => t("currency", { amount: money(amount) }),
    footer: startList("pdfFooter", { date: generated }),
    page: (page, pages) => startList("pdfPage", { page, pages }),
    empty: t("empty"),
  };
}
