/**
 * Doklad o zaplacení startovného – čistá logika (bez DB a bez PDF).
 */
import { lineFee, registrationFee, sumPayments } from "@/lib/entries/fee-total";
import { variableSymbol } from "@/lib/entries/spd";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";

export type ReceiptLocale = "cs" | "en";

export function parseReceiptLocale(raw: string | null | undefined): ReceiptLocale {
  return raw === "en" ? "en" : "cs";
}

/** Stabilní číslo dokladu: MCVV{rok}-{id na 3 místa}, např. MCVV2026-042. */
export function receiptNumber(year: number, id: number): string {
  return `MCVV${year}-${String(id).padStart(3, "0")}`;
}

/** Odkaz na PDF (route handler mimo locale segment). */
export function receiptHref(year: number, id: number, locale: string): string {
  return `/api/prihlasky/${year}/${id}/doklad?lang=${parseReceiptLocale(locale)}`;
}

export function receiptFilename(year: number, id: number): string {
  return `doklad-${receiptNumber(year, id)}.pdf`;
}

/** Doklad jen pro neodhlášenou přihlášku se závodníky, startovným > 0 a plně uhrazenou. */
export function isReceiptEligible(entry: {
  status: number | null | undefined;
  lineCount: number;
  fee: number;
  paid: number;
}): boolean {
  return (
    entry.status !== ENTRY_STATUS.cancelled &&
    entry.lineCount > 0 &&
    entry.fee > 0 &&
    entry.paid >= entry.fee
  );
}

/**
 * Kdo smí doklad stáhnout: pořadatel (staff) jakoukoli přihlášku, přihlašující jen
 * svou (shoda e-mailu) a jen pro aktuální ročník.
 */
export function canDownloadReceipt(input: {
  staff: boolean;
  sessionEmail: string;
  registrationEmail: string | null | undefined;
  year: number;
  currentYear: number;
}): boolean {
  if (input.staff) {
    return true;
  }
  const owner = (input.registrationEmail ?? "").trim().toLowerCase();
  return (
    owner !== "" &&
    owner === input.sessionEmail.trim().toLowerCase() &&
    input.year === input.currentYear
  );
}

export type ReceiptPaymentInput = {
  id: number;
  date: Date | null;
  created: Date;
  amount: number | null;
  author: string | null;
};

export type ReceiptPaymentMethod = "bank" | "organizer";

/** Platby spárované z Fio mají autora „fio“; ostatní zadal pořadatel ručně. */
export function paymentMethod(author: string | null | undefined): ReceiptPaymentMethod {
  return author?.trim().toLowerCase() === "fio" ? "bank" : "organizer";
}

/** Pražský kalendářní den okamžiku jako DATE (půlnoc UTC), stejně jako `mcvv_platba.datum`. */
export function pragueCalendarDay(value: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Den platby: `datum`, a když chybí, pražský den zadání (`created`). */
export function paymentDay(payment: ReceiptPaymentInput): Date {
  return payment.date ?? pragueCalendarDay(payment.created);
}

/** Platby chronologicky (datum platby, jinak datum zadání; při shodě podle id). */
export function sortPayments<T extends ReceiptPaymentInput>(payments: readonly T[]): T[] {
  return [...payments].sort(
    (a, b) => paymentDay(a).getTime() - paymentDay(b).getTime() || a.id - b.id,
  );
}

/**
 * Datum vystavení = den platby, kterou součet plateb poprvé pokryl startovné.
 * Je stabilní (nemění se při dalším stažení). Null, když startovné pokryté není.
 */
export function completionDate(payments: readonly ReceiptPaymentInput[], fee: number): Date | null {
  let total = 0;
  for (const payment of sortPayments(payments)) {
    total += payment.amount ?? 0;
    if (total >= fee) {
      return paymentDay(payment);
    }
  }
  return null;
}

export type ReceiptLine = {
  runner: string;
  birthYear: string;
  club: string;
  category: string;
  fee: number;
};

export type ReceiptPayment = {
  date: Date;
  method: ReceiptPaymentMethod;
  amount: number;
};

export type ReceiptDocument = {
  number: string;
  year: number;
  registrationId: number;
  variableSymbol: string;
  issueDate: Date;
  raceDate: Date;
  payerName: string;
  payerEmail: string;
  issuer: { name: string; address: string; ico: string; vatNote: string };
  lines: ReceiptLine[];
  payments: ReceiptPayment[];
  fee: number;
  paid: number;
  /** Kolik je zaplaceno navíc (jen informativně). */
  overpaid: number;
  generatedAt: Date;
};

/** Částka: cs „1 350 Kč“, en „CZK 1,350“. */
export function formatAmount(value: number, locale: ReceiptLocale): string {
  if (locale === "en") {
    return `CZK ${value.toLocaleString("en-GB")}`;
  }
  return `${value.toLocaleString("cs-CZ").replace(/\s/g, " ")} Kč`;
}

const TAG: Record<ReceiptLocale, string> = { cs: "cs-CZ", en: "en-GB" };

/** Kalendářní datum uložené jako DATE (půlnoc UTC) – formát bez posunu časové zóny. */
export function formatCalendarDate(value: Date, locale: ReceiptLocale): string {
  return new Intl.DateTimeFormat(TAG[locale], {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

/** Okamžik v pražském čase (datum závodu, čas vygenerování). */
export function formatPragueDate(value: Date, locale: ReceiptLocale, withTime = false): string {
  return new Intl.DateTimeFormat(TAG[locale], {
    day: "numeric",
    month: locale === "en" ? "short" : "numeric",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
    timeZone: "Europe/Prague",
  }).format(value);
}

export type ReceiptSourceLine = {
  runnerId: string;
  entryFee: number | null;
  runner: { name: string };
  club: { name: string };
  category: { name: string; entryFee: number | null };
};

/**
 * Data dokladu z přihlášky a jejích plateb. Null, když doklad vystavit nelze
 * (odhlášená, bez závodníků, startovné 0 Kč nebo není plně uhrazeno).
 */
export function buildReceipt(input: {
  year: number;
  id: number;
  email: string | null;
  name: string | null;
  status: number | null;
  lines: readonly ReceiptSourceLine[];
  payments: readonly ReceiptPaymentInput[];
  issuer: ReceiptDocument["issuer"];
  raceDate: Date;
  now: Date;
}): ReceiptDocument | null {
  const fee = registrationFee(input.lines);
  const paid = sumPayments(input.payments);
  if (!isReceiptEligible({ status: input.status, lineCount: input.lines.length, fee, paid })) {
    return null;
  }
  const issueDate = completionDate(input.payments, fee);
  if (!issueDate) {
    return null;
  }
  return {
    number: receiptNumber(input.year, input.id),
    year: input.year,
    registrationId: input.id,
    variableSymbol: variableSymbol(input.year, input.id),
    issueDate,
    raceDate: input.raceDate,
    payerName: input.name?.trim() || input.lines[0]?.runner.name || "",
    payerEmail: input.email?.trim() ?? "",
    issuer: input.issuer,
    lines: input.lines.map((line) => ({
      runner: line.runner.name,
      birthYear: line.runnerId.slice(0, 4),
      club: line.club.name,
      category: line.category.name,
      fee: lineFee(line),
    })),
    payments: sortPayments(input.payments)
      .filter((payment) => (payment.amount ?? 0) !== 0)
      .map((payment) => ({
        date: paymentDay(payment),
        method: paymentMethod(payment.author),
        amount: payment.amount ?? 0,
      })),
    fee,
    paid,
    overpaid: Math.max(0, paid - fee),
    generatedAt: input.now,
  };
}
