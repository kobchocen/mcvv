/**
 * E-mailová účtenka k prodejce pokladny (#223): položky, kusy, ceny, celkem, způsob a stav
 * platby, VS. Jazyk prodejky (cs / en / de / pl / uk, výchozí cs). Čisté funkce.
 */
import { escapeHtml, renderBrandedEmail } from "@/lib/mail/layout";

export const RECEIPT_LOCALES = ["cs", "en", "de", "pl", "uk"] as const;
export type ReceiptLocale = (typeof RECEIPT_LOCALES)[number];

export function receiptLocale(value: unknown): ReceiptLocale {
  return typeof value === "string" && (RECEIPT_LOCALES as readonly string[]).includes(value)
    ? (value as ReceiptLocale)
    : "cs";
}

type Labels = {
  subject: (n: number) => string;
  intro: string;
  item: string;
  qty: string;
  price: string;
  lineTotal: string;
  total: string;
  vs: string;
  payment: string;
  unpaid: (account: string) => string;
  paidCash: (at: string) => string;
  paidBank: (at: string) => string;
  cancelled: string;
  footer: string;
  thanks: string;
};

const LABELS: Record<ReceiptLocale, Labels> = {
  cs: {
    subject: (n) => `Účtenka MCVV č. ${n}`,
    intro: "Děkujeme za nákup v závodní kanceláři MCVV. Posíláme účtenku.",
    item: "Položka",
    qty: "Ks",
    price: "Cena",
    lineTotal: "Celkem",
    total: "Celkem k úhradě",
    vs: "Variabilní symbol",
    payment: "Platba",
    unpaid: (a) => `Nezaplaceno – převodem na účet ${a} s variabilním symbolem níže.`,
    paidCash: (at) => `Zaplaceno hotově (${at}).`,
    paidBank: (at) => `Zaplaceno převodem (${at}).`,
    cancelled: "Prodejka byla stornována.",
    footer:
      "Tento e-mail jste dostali, protože jste v závodní kanceláři MCVV požádali o účtenku na",
    thanks: "Sportu zdar!",
  },
  en: {
    subject: (n) => `MCVV receipt no. ${n}`,
    intro: "Thank you for your purchase at the MCVV race office. Here is your receipt.",
    item: "Item",
    qty: "Qty",
    price: "Price",
    lineTotal: "Total",
    total: "Total due",
    vs: "Variable symbol",
    payment: "Payment",
    unpaid: (a) => `Not paid yet – bank transfer to ${a} with the variable symbol below.`,
    paidCash: (at) => `Paid in cash (${at}).`,
    paidBank: (at) => `Paid by bank transfer (${at}).`,
    cancelled: "The sale was cancelled.",
    footer: "You received this e-mail because you asked for a receipt at the MCVV race office on",
    thanks: "Enjoy the race!",
  },
  de: {
    subject: (n) => `MCVV-Beleg Nr. ${n}`,
    intro: "Vielen Dank für Ihren Einkauf im MCVV-Wettkampfbüro. Hier ist Ihr Beleg.",
    item: "Artikel",
    qty: "Stk.",
    price: "Preis",
    lineTotal: "Summe",
    total: "Gesamtbetrag",
    vs: "Variables Symbol",
    payment: "Zahlung",
    unpaid: (a) => `Noch nicht bezahlt – Überweisung auf ${a} mit dem variablen Symbol unten.`,
    paidCash: (at) => `Bar bezahlt (${at}).`,
    paidBank: (at) => `Per Überweisung bezahlt (${at}).`,
    cancelled: "Der Verkauf wurde storniert.",
    footer:
      "Sie erhalten diese E-Mail, weil Sie im MCVV-Wettkampfbüro einen Beleg angefordert haben –",
    thanks: "Viel Spaß beim Rennen!",
  },
  pl: {
    subject: (n) => `Paragon MCVV nr ${n}`,
    intro: "Dziękujemy za zakup w biurze zawodów MCVV. Przesyłamy paragon.",
    item: "Pozycja",
    qty: "Szt.",
    price: "Cena",
    lineTotal: "Razem",
    total: "Do zapłaty",
    vs: "Symbol zmienny",
    payment: "Płatność",
    unpaid: (a) => `Nie zapłacono – przelew na konto ${a} z symbolem zmiennym poniżej.`,
    paidCash: (at) => `Zapłacono gotówką (${at}).`,
    paidBank: (at) => `Zapłacono przelewem (${at}).`,
    cancelled: "Sprzedaż została anulowana.",
    footer: "Otrzymujesz tę wiadomość, ponieważ poprosiłeś o paragon w biurze zawodów MCVV –",
    thanks: "Powodzenia na trasie!",
  },
  uk: {
    subject: (n) => `Чек MCVV № ${n}`,
    intro: "Дякуємо за покупку в офісі змагань MCVV. Надсилаємо чек.",
    item: "Позиція",
    qty: "К-сть",
    price: "Ціна",
    lineTotal: "Разом",
    total: "До сплати",
    vs: "Варіабельний символ",
    payment: "Оплата",
    unpaid: (a) => `Не оплачено – переказ на рахунок ${a} з варіабельним символом нижче.`,
    paidCash: (at) => `Оплачено готівкою (${at}).`,
    paidBank: (at) => `Оплачено переказом (${at}).`,
    cancelled: "Продаж скасовано.",
    footer: "Ви отримали цей лист, бо попросили чек в офісі змагань MCVV –",
    thanks: "Вдалого забігу!",
  },
};

export type ReceiptSale = {
  number: number;
  vs: string;
  total: number;
  status: string;
  paidAt: Date | null;
  lines: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
};

const czk = (value: number) => `${value.toLocaleString("cs-CZ")} Kč`;

function paymentLine(l: Labels, sale: ReceiptSale, account: string, locale: ReceiptLocale) {
  const at = sale.paidAt
    ? sale.paidAt.toLocaleString(locale === "uk" ? "uk-UA" : locale === "cs" ? "cs-CZ" : locale, {
        timeZone: "Europe/Prague",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "";
  switch (sale.status) {
    case "paid_cash":
      return l.paidCash(at);
    case "paid_bank":
      return l.paidBank(at);
    case "cancelled":
      return l.cancelled;
    default:
      return l.unpaid(account);
  }
}

export function renderSaleReceipt(input: {
  sale: ReceiptSale;
  locale: ReceiptLocale;
  site: string;
  account: string;
}): { subject: string; html: string; text: string } {
  const { sale, locale, site, account } = input;
  const l = LABELS[locale];
  const subject = l.subject(sale.number);
  const payment = paymentLine(l, sale, account, locale);
  const cell = "padding:6px 8px;border-bottom:1px solid #e3e9e4";
  const right = `${cell};text-align:right;white-space:nowrap`;
  const rows = sale.lines
    .map(
      (line) =>
        `<tr><td style="${cell}">${escapeHtml(line.name)}</td><td style="${right}">${line.quantity}</td><td style="${right}">${czk(line.unitPrice)}</td><td style="${right}">${czk(line.lineTotal)}</td></tr>`,
    )
    .join("");
  const htmlBlocks = [
    `<p style="margin:0 0 16px">${escapeHtml(l.intro)}</p>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:0 0 16px"><tr style="color:#5d6d63;text-align:left"><th style="${cell}">${escapeHtml(l.item)}</th><th style="${right}">${escapeHtml(l.qty)}</th><th style="${right}">${escapeHtml(l.price)}</th><th style="${right}">${escapeHtml(l.lineTotal)}</th></tr>${rows}<tr><td colspan="3" style="${cell};font-weight:bold">${escapeHtml(l.total)}</td><td style="${right};font-weight:bold">${czk(sale.total)}</td></tr></table>`,
    `<p style="margin:0 0 8px"><strong>${escapeHtml(l.payment)}:</strong> ${escapeHtml(payment)}</p>`,
    `<p style="margin:0 0 16px"><strong>${escapeHtml(l.vs)}:</strong> ${escapeHtml(sale.vs)}</p>`,
    `<p style="margin:0">${escapeHtml(l.thanks)}</p>`,
  ];
  const text = [
    l.intro,
    "",
    ...sale.lines.map(
      (line) => `${line.name} – ${line.quantity} × ${czk(line.unitPrice)} = ${czk(line.lineTotal)}`,
    ),
    "",
    `${l.total}: ${czk(sale.total)}`,
    `${l.payment}: ${payment}`,
    `${l.vs}: ${sale.vs}`,
    "",
    l.thanks,
  ].join("\n");
  return {
    subject,
    ...renderBrandedEmail({ subject, site, htmlBlocks, text, footer: l.footer, locale }),
  };
}
