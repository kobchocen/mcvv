/**
 * E-maily doplatku standardu: „zaplaťte dnes do 12:00“ (mockup stav h) a oznámení
 * o automatickém zrušení. Veřejné texty: bez „slotů“, bez zmínky o pořadatelích.
 */
import { BANK_ACCOUNT, BANK_IBAN, variableSymbol } from "@/lib/entries/spd";
import { escapeHtml, renderBrandedEmail } from "@/lib/mail/layout";
import { paymentMessage, qrImageUrl } from "@/lib/reminders/render";

import {
  lastMinuteOf,
  pragueAtClock,
  pragueClock,
  pragueDayLabel,
  pragueUntilDayLabel,
} from "./standard-pay-core";

export const STANDARD_PAY_SIGNATURE = "Těšíme se na vás – K.O.B. Choceň";

export type StandardPayMailInput = {
  year: number;
  id: number;
  lines: { runner: string; fee: number }[];
  fee: number;
  paid: number;
  site: string;
  /** Exkluzivní konec standardních přihlášek. */
  standardEnd: Date;
  payUntil: Date;
  /** Pozdní přihlášky (jen když jsou zapnuté). */
  late: { to: Date; feeAdult: number; feeYouth: number } | null;
  onsite: { raceDate: Date; from: Date; to: Date; feeAdult: number; feeYouth: number };
};

const kc = (value: number) => `${value.toLocaleString("cs-CZ").replace(/\u00a0/g, " ")} Kč`;
const p = (v: string) => `<p style="margin:0 0 16px">${v}</p>`;
const h2 = (v: string) =>
  `<h2 style="margin:8px 0 12px;font-size:19px;color:#0f2a1c">${escapeHtml(v)}</h2>`;
const payRow = (label: string, value: string) =>
  `<tr><td style="padding:3px 12px 3px 0;font-size:14px;color:#5d6d63;vertical-align:top">${escapeHtml(label)}</td><td style="padding:3px 0;font-size:14px;font-weight:bold">${value}</td></tr>`;
const button = (label: string, url: string) =>
  `<p style="margin:0 0 20px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#e2531c;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px">${escapeHtml(label)}</a></p>`;
const warning = (v: string) =>
  `<p style="margin:0 0 16px;padding:12px 14px;background:#fff4ec;border-left:4px solid #e2531c">${v}</p>`;

function lateOffer(input: StandardPayMailInput): string {
  const onsiteDay = pragueDayLabel(input.onsite.raceDate);
  const onsite = `na místě ${onsiteDay} v závodní kanceláři`;
  if (!input.late) return onsite;
  const late = `jako pozdní přihlášku (${input.late.feeAdult} / ${input.late.feeYouth} Kč)`;
  return `${late} nebo ${onsite}`;
}

function runnersText(lines: StandardPayMailInput["lines"]): string {
  return lines.map((line) => `${line.runner} (${kc(line.fee)})`).join(", ");
}

/** E-mail v den lhůty ráno: přihláška není zaplacená, zaplaťte dnes do 12:00. */
export function renderStandardPayMail(input: StandardPayMailInput) {
  const remaining = Math.max(0, input.fee - input.paid);
  const vs = variableSymbol(input.year, input.id);
  const until = pragueClock(input.payUntil);
  const ended = lastMinuteOf(input.standardEnd);
  const subject = `MCVV ${input.year} – přihláška č. ${input.id} není zaplacená: zaplaťte dnes do ${until}`;
  const intro = `Dobrý den, standardní přihlášky skončily ${pragueDayLabel(ended)} ${pragueAtClock(ended)} a k přihlášce č. ${input.id} jsme zatím nenašli platbu.`;
  const warn = `Zaplaťte nejpozději dnes, ${pragueDayLabel(input.payUntil, true)}, do ${until}. Potom se přihláška automaticky zruší a běžce bude možné přihlásit už jen ${lateOffer(input)}.`;
  const qrNote = `QR platba – použijte prosím okamžitou platbu. Přihláška je už uzavřená, nelze ji měnit. Platba, která dorazí po ${until}, se vrací.`;
  const qr = qrImageUrl(input.site, input.year, input.id, remaining);
  const myEntry = `${input.site}/prihlasky`;
  const htmlBlocks = [
    h2("Přihláška není zaplacená"),
    p(escapeHtml(intro)),
    warning(`<strong>${escapeHtml(warn)}</strong>`),
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td valign="top" style="padding-right:20px"><table role="presentation" cellpadding="0" cellspacing="0">${payRow("K úhradě", escapeHtml(kc(remaining)))}${payRow("Variabilní symbol", escapeHtml(vs))}${payRow("Účet", `${escapeHtml(BANK_ACCOUNT.replace("/", " / "))} (Fio)`)}${payRow("Zpráva pro příjemce", escapeHtml(paymentMessage(input.id)))}${payRow("Běžci", escapeHtml(runnersText(input.lines)))}</table></td><td valign="top"><img src="${escapeHtml(qr)}" width="150" height="150" alt="QR platba" style="display:block;border:1px solid #e3e9e2"></td></tr></table>`,
    p(`<span style="font-size:13px;color:#5d6d63">${escapeHtml(qrNote)}</span>`),
    button("Zaplatit – Moje přihláška", myEntry),
    p(`Pokud jste už zaplatili, považujte prosím tento e-mail za bezpředmětný.`),
    p(escapeHtml(STANDARD_PAY_SIGNATURE)),
  ];
  const text = [
    "Přihláška není zaplacená",
    "",
    intro,
    "",
    warn,
    "",
    `K úhradě: ${kc(remaining)}`,
    `Variabilní symbol: ${vs}`,
    `Účet: ${BANK_ACCOUNT.replace("/", " / ")} (Fio), IBAN ${BANK_IBAN}`,
    `Zpráva pro příjemce: ${paymentMessage(input.id)}`,
    `Běžci: ${runnersText(input.lines)}`,
    `QR platba: ${qr}`,
    qrNote,
    "",
    `Zaplatit – Moje přihláška: ${myEntry}`,
    "",
    "Pokud jste už zaplatili, považujte prosím tento e-mail za bezpředmětný.",
    "",
    STANDARD_PAY_SIGNATURE,
  ].join("\n");
  return { subject, ...renderBrandedEmail({ subject, site: input.site, htmlBlocks, text }) };
}

/** Oznámení o automatickém zrušení nezaplacené přihlášky po lhůtě. */
export function renderAutoCancelMail(input: StandardPayMailInput) {
  const subject = `MCVV ${input.year} – přihláška č. ${input.id} byla zrušena (nezaplaceno)`;
  const intro = `Dobrý den, přihlášku č. ${input.id} jsme ${pragueDayLabel(input.payUntil)} ${pragueAtClock(input.payUntil)} automaticky zrušili, protože k ní do konce lhůty nedorazila platba startovného.`;
  const offers: string[] = [];
  if (input.late) {
    offers.push(
      `jako pozdní přihlášku ${pragueUntilDayLabel(input.late.to)} ${pragueClock(input.late.to)} (dospělí ${input.late.feeAdult} Kč / mládež ${input.late.feeYouth} Kč, zaplatit je potřeba hned) v sekci Moje přihláška`,
    );
  }
  offers.push(
    `na místě ${pragueDayLabel(input.onsite.raceDate)} v závodní kanceláři od ${pragueClock(input.onsite.from)} do ${pragueClock(input.onsite.to)} (dospělí ${input.onsite.feeAdult} Kč / mládež ${input.onsite.feeYouth} Kč)`,
  );
  const offer = `Běžce můžete ještě přihlásit ${offers.join(", nebo ")}.`;
  const refund =
    "Pokud jste mezitím zaplatili, platbu vám vrátíme na účet, ze kterého přišla. Zrušenou přihlášku už nelze obnovit.";
  const myEntry = `${input.site}/prihlasky`;
  const htmlBlocks = [
    h2("Přihláška byla zrušena"),
    p(escapeHtml(intro)),
    p(`<strong>Zrušení běžci:</strong> ${escapeHtml(runnersText(input.lines))}`),
    p(escapeHtml(offer)),
    p(escapeHtml(refund)),
    ...(input.late ? [button("Moje přihláška", myEntry)] : []),
    p(escapeHtml(STANDARD_PAY_SIGNATURE)),
  ];
  const text = [
    "Přihláška byla zrušena",
    "",
    intro,
    "",
    `Zrušení běžci: ${runnersText(input.lines)}`,
    "",
    offer,
    "",
    refund,
    ...(input.late ? ["", `Moje přihláška: ${myEntry}`] : []),
    "",
    STANDARD_PAY_SIGNATURE,
  ].join("\n");
  return { subject, ...renderBrandedEmail({ subject, site: input.site, htmlBlocks, text }) };
}
