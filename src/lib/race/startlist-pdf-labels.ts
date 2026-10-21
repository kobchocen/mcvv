import cs from "@/i18n/locales/cs/common.json";
import en from "@/i18n/locales/en/common.json";

import { formatClock, type StartModel } from "./start-time";
import type { StartListPdfLabels } from "./startlist-pdf";

export type StartListPdfLocale = "cs" | "en";

type Messages = typeof cs.StartList;

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

const DAY: Record<StartListPdfLocale, string> = { cs: "cs-CZ", en: "en-GB" };

/** Texty tiskové startovky ze sekce „StartList“ v common.json (bez next-intl kontextu). */
export function startListPdfLabels(
  locale: StartListPdfLocale,
  input: {
    year: number;
    editionNumber: number;
    raceDate: Date | null;
    model: StartModel;
    count: number;
    generatedAt: Date;
  },
): StartListPdfLabels {
  const messages: Messages = locale === "en" ? en.StartList : cs.StartList;
  const brand = locale === "en" ? en.Home.brand : cs.Home.brand;
  const raceDay = input.raceDate
    ? new Intl.DateTimeFormat(DAY[locale], {
        weekday: "long",
        day: "numeric",
        month: locale === "en" ? "long" : "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(input.raceDate)
    : String(input.year);
  const generated = new Intl.DateTimeFormat(DAY[locale], {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Prague",
  }).format(input.generatedAt);
  return {
    brandTop: brand.top,
    brandBottom: brand.bottom,
    brandMark: brand.mark,
    title: fill(messages.pdfTitle, { year: input.year }),
    edition: fill(messages.pdfEdition, { n: input.editionNumber }),
    raceDay,
    model: fill(messages.pdfModel, {
      zero: formatClock(input.model.zeroSeconds),
      interval: input.model.intervalSeconds,
      second: input.model.secondStartFrom,
    }),
    count: fill(messages.pdfCount, { count: input.count }),
    legend: fill(messages.pdfLegend, { offset: input.model.secondStartFrom - 1 }),
    colTime: messages.colTime,
    colBib: messages.colBib,
    colName: messages.colName,
    colBirth: messages.colBirthShort,
    colClub: messages.colClub,
    colCategory: messages.pdfCategory,
    footer: fill(messages.pdfFooter, { date: generated }),
    page: (page, pages) => fill(messages.pdfPage, { page, pages }),
    empty: messages.pdfEmpty,
  };
}
