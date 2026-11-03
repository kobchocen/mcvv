/**
 * E-maily pozdních přihlášek (mockup dohlaska.html, stavy k a l – schváleno Q350):
 * k) hned po odeslání „zaplaťte dnes do HH:MM“ (lhůta 60 min),
 * l) po lhůtě „přihláška zrušena, platba nedorazila včas“.
 * Veřejné texty: bez „slotů“, „ZK“, spec. startu a bez zmínky o startovném zdarma.
 */
import { BANK_ACCOUNT, BANK_IBAN, variableSymbol } from "@/lib/entries/spd";
import { escapeHtml, renderBrandedEmail } from "@/lib/mail/layout";
import { paymentMessage, qrImageUrl } from "@/lib/reminders/render";

import { pragueCivil } from "./core";
import { LATE_PAY_MINUTES } from "./late-core";
import {
  pragueAtClock,
  pragueClock,
  pragueDayLabel,
  pragueUntilDayLabel,
} from "./standard-pay-core";

export type LateMailInput = {
  year: number;
  id: number;
  lines: { runner: string; fee: number }[];
  fee: number;
  paid: number;
  site: string;
  submittedAt: Date;
  payUntil: Date;
  /** Den závodu (patička „neděle 6. 12. 2026“). */
  raceDate: Date | null;
};

export type LateCancelMailInput = LateMailInput & {
  /** Pozdní přihlášky ještě běží → nabídka nové pozdní přihlášky. */
  late: { to: Date } | null;
  /** Přihláška na místě (závodní kancelář), když ještě neskončila. */
  onsite: { from: Date; to: Date; feeAdult: number; feeYouth: number } | null;
};

const WEEKDAY = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"] as const;

/** „neděle 6. 12. 2026“ v pražském čase. */
export function pragueWeekdayDate(d: Date): string {
  const c = pragueCivil(d);
  const weekday = new Date(Date.UTC(c.year, c.month - 1, c.day)).getUTCDay();
  return `${WEEKDAY[weekday]} ${c.day}. ${c.month}. ${c.year}`;
}

function samePragueDay(a: Date, b: Date): boolean {
  const x = pragueCivil(a);
  const y = pragueCivil(b);
  return x.year === y.year && x.month === y.month && x.day === y.day;
}

const kc = (value: number) => `${value.toLocaleString("cs-CZ").replace(/\u00a0/g, " ")} Kč`;
const p = (v: string, style = "") => `<p style="margin:0 0 16px${style}">${v}</p>`;
const h2 = (v: string) =>
  `<h2 style="margin:8px 0 12px;font-size:21px;color:#0f2a1c">${escapeHtml(v)}</h2>`;
const row = (label: string, value: string) =>
  `<tr><td style="padding:9px 12px 9px 0;font-size:14px;color:#1d2a22;border-bottom:1px solid #e3e9e2;vertical-align:top;width:120px">${escapeHtml(label)}</td><td style="padding:9px 0;font-size:14px;border-bottom:1px solid #e3e9e2">${value}</td></tr>`;
const button = (label: string, url: string) =>
  `<p style="margin:0 0 8px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#e2531c;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:4px">${escapeHtml(label)}</a></p>`;
const warning = (v: string) =>
  `<p style="margin:0 0 16px;padding:12px 14px;background:#fff4ec;border-left:4px solid #e2531c">${v}</p>`;
const muted = (v: string) => p(escapeHtml(v), ";font-size:14px;color:#5d6d63");

function runnersText(lines: LateMailInput["lines"]): string {
  return lines.map((line) => `${line.runner} (${kc(line.fee)})`).join(", ");
}

function footer(input: LateMailInput): string {
  const day = input.raceDate ? ` · ${pragueWeekdayDate(input.raceDate)}` : "";
  return `Malá cena Velké Verandy${day} · Choceň · Tento e-mail byl odeslán automaticky z`;
}

/** Předmět a věta s lhůtou: „dnes do 13:32“, přes půlnoc „do pátku 4. 12. 0:30“. */
function deadlineParts(input: LateMailInput) {
  const until = pragueClock(input.payUntil);
  if (samePragueDay(input.submittedAt, input.payUntil)) {
    return {
      subject: `zaplaťte dnes do ${until}`,
      sentence: `Zaplaťte nejpozději dnes, ${pragueDayLabel(input.payUntil, true)}, do ${until}.`,
    };
  }
  return {
    subject: `zaplaťte ${pragueUntilDayLabel(input.payUntil)} ${until}`,
    sentence: `Zaplaťte nejpozději ${pragueDayLabel(input.payUntil, true)} ${pragueAtClock(input.payUntil)}.`,
  };
}

/** Stav k: hned po odeslání pozdní přihlášky – zaplaťte do 60 minut. */
export function renderLatePayMail(input: LateMailInput) {
  const remaining = Math.max(0, input.fee - input.paid);
  const vs = variableSymbol(input.year, input.id);
  const deadline = deadlineParts(input);
  const subject = `MCVV ${input.year} – pozdní přihláška č. ${input.id}: ${deadline.subject}`;
  const title = `Zaplaťte do ${LATE_PAY_MINUTES} minut`;
  const intro = `Dobrý den, pozdní přihlášku č. ${input.id} jsme přijali.`;
  const warnRest =
    "Pokud platba do té doby nedorazí na účet závodu, přihláška se automaticky zruší. Použijte prosím okamžitou platbu – běžný převod z jiné banky může dorazit až po lhůtě.";
  const qrNote =
    "QR platba. Stav platby uvidíte v Moje přihláška – stránka se obnovuje sama. Jakmile platba dorazí, pošleme potvrzení.";
  const locked =
    "Odeslanou pozdní přihlášku už nelze měnit. Zaplacenou přihlášku nelze zrušit a startovné se nevrací.";
  const account = `${BANK_ACCOUNT.replace("/", " / ")} (Fio)`;
  const qr = qrImageUrl(input.site, input.year, input.id, remaining);
  const myEntry = `${input.site}/prihlasky`;
  const htmlBlocks = [
    h2(title),
    p(escapeHtml(intro)),
    warning(
      `<strong>${escapeHtml(deadline.sentence)}</strong> ${escapeHtml(warnRest).replace("automaticky zruší", "<strong>automaticky zruší</strong>")}`,
    ),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${row("K úhradě", `<strong>${escapeHtml(kc(remaining))}</strong>`)}${row("Variabilní symbol", `<strong>${escapeHtml(vs)}</strong>`)}${row("Účet", escapeHtml(account))}${row("Zpráva pro příjemce", escapeHtml(paymentMessage(input.id)))}${row("Běžci", escapeHtml(runnersText(input.lines)))}</table>`,
    remaining > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td valign="middle" style="padding-right:16px"><img src="${escapeHtml(qr)}" width="120" height="120" alt="QR platba" style="display:block;border:1px solid #dddddd;padding:4px;background:#ffffff"></td><td valign="middle" style="font-size:13px;color:#5d6d63">${escapeHtml(qrNote)}</td></tr></table>`
      : "",
    muted(locked),
    button("Zaplatit – Moje přihláška", myEntry),
  ].filter(Boolean);
  const text = [
    title,
    "",
    intro,
    "",
    `${deadline.sentence} ${warnRest}`,
    "",
    `K úhradě: ${kc(remaining)}`,
    `Variabilní symbol: ${vs}`,
    `Účet: ${account}, IBAN ${BANK_IBAN}`,
    `Zpráva pro příjemce: ${paymentMessage(input.id)}`,
    `Běžci: ${runnersText(input.lines)}`,
    ...(remaining > 0 ? [`QR platba: ${qr}`, qrNote.replace(/^QR platba\. /, "")] : []),
    "",
    locked,
    "",
    `Zaplatit – Moje přihláška: ${myEntry}`,
  ].join("\n");
  return {
    subject,
    ...renderBrandedEmail({ subject, site: input.site, htmlBlocks, text, footer: footer(input) }),
  };
}

/** Stav l: lhůta vypršela, platba nedorazila – přihláška zrušena. */
export function renderLateCancelMail(input: LateCancelMailInput) {
  const vs = variableSymbol(input.year, input.id);
  const subject = `MCVV ${input.year} – pozdní přihláška č. ${input.id} zrušena: platba nedorazila včas`;
  const title = "Přihláška byla zrušena";
  const intro = `Dobrý den, lhůta na zaplacení pozdní přihlášky č. ${input.id} vypršela ${pragueDayLabel(input.payUntil)} ${pragueAtClock(input.payUntil)}. Do té doby jsme na účtu platbu s VS ${vs} nenašli, proto se přihláška automaticky zrušila. Běžci z této přihlášky nejsou přihlášeni.`;
  const items: { html: string; text: string }[] = [
    {
      html: "<strong>Platbu jste už odeslali?</strong> Platbu, která dorazí po zrušení, <strong>vrátíme</strong> na účet, ze kterého přišla. Přihláška zůstává zrušená.",
      text: "Platbu jste už odeslali? Platbu, která dorazí po zrušení, vrátíme na účet, ze kterého přišla. Přihláška zůstává zrušená.",
    },
  ];
  if (input.late) {
    const end = `${pragueUntilDayLabel(input.late.to)} ${pragueClock(input.late.to)}`;
    items.push({
      html: `<strong>Chcete běžet?</strong> Pošlete <strong>novou pozdní přihlášku</strong> (${escapeHtml(end)}) a zaplaťte ji okamžitou platbou do ${LATE_PAY_MINUTES} minut.`,
      text: `Chcete běžet? Pošlete novou pozdní přihlášku (${end}) a zaplaťte ji okamžitou platbou do ${LATE_PAY_MINUTES} minut.`,
    });
  }
  if (input.onsite) {
    const lead = input.late ? "Nebo se přihlaste" : "Přihlásit se můžete ještě";
    const day = pragueDayLabel(input.onsite.from);
    const hours = `${pragueClock(input.onsite.from)}–${pragueClock(input.onsite.to)}`;
    const fees = `${input.onsite.feeAdult} Kč dospělí / ${input.onsite.feeYouth} Kč mládež`;
    items.push({
      html: `${lead} <strong>na místě</strong> ${escapeHtml(day)} v závodní kanceláři (${hours}), ${escapeHtml(fees)}.`,
      text: `${lead} na místě ${day} v závodní kanceláři (${hours}), ${fees}.`,
    });
  }
  const myEntry = `${input.site}/prihlasky`;
  const htmlBlocks = [
    h2(title),
    p(escapeHtml(intro)),
    `<ul style="margin:0 0 16px;padding-left:18px;line-height:1.6">${items.map((item) => `<li>${item.html}</li>`).join("")}</ul>`,
    button("Moje přihláška", myEntry),
  ];
  const text = [
    title,
    "",
    intro,
    "",
    ...items.map((item) => `- ${item.text}`),
    "",
    `Moje přihláška: ${myEntry}`,
  ].join("\n");
  return {
    subject,
    ...renderBrandedEmail({ subject, site: input.site, htmlBlocks, text, footer: footer(input) }),
  };
}
