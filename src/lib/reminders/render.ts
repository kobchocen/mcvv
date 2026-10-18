import { raceDateLabel, RACE_PLACE, SIGNATURE } from "@/lib/entries/confirm-mail-render";
import { BANK_ACCOUNT, BANK_IBAN, variableSymbol } from "@/lib/entries/spd";
import { RACE_START_HOUR, RACE_START_MINUTE } from "@/lib/date/race-schedule";
import { escapeHtml, renderBrandedEmail } from "@/lib/mail/layout";

export type ReminderKind = 1 | 2;

export type ReminderInput = {
  kind: ReminderKind;
  year: number;
  id: number;
  name: string | null | undefined;
  lines: { runner: string; club: string; category: string; fee: number }[];
  fee: number;
  paid: number;
  site: string;
  /** Datum uzávěrky (YYYY-MM-DD) – pro text. */
  deadline: string | null;
};

const kc = (value: number) => `${value.toLocaleString("cs-CZ").replace(/\u00a0/g, " ")} Kč`;

export function paymentMessage(id: number): string {
  return `STARTOVNE MCVV PRIHLASKA ${id}`;
}

export function qrImageUrl(site: string, year: number, id: number, amount: number): string {
  return `${site}/api/platba-qr?rok=${year}&id=${id}&castka=${amount}`;
}

function deadlineLabel(deadline: string | null): string {
  if (!deadline) return "";
  const [, m, d] = deadline.split("-").map(Number);
  return `${d}. ${m}.`;
}

export function renderReminder(input: ReminderInput) {
  const remaining = Math.max(0, input.fee - input.paid);
  const vs = variableSymbol(input.year, input.id);
  const message = paymentMessage(input.id);
  const start = `${RACE_START_HOUR}:${String(RACE_START_MINUTE).padStart(2, "0")}`;
  const date = raceDateLabel(input.year);
  const editUrl = `${input.site}/prihlasky`;
  const deadline = deadlineLabel(input.deadline);
  const subject =
    input.kind === 1
      ? `Platba startovného – přihláška ${input.year}/${input.id}`
      : `Připomínka: nezaplacené startovné – přihláška ${input.year}/${input.id}`;
  const greeting = `Dobrý den${input.name ? `, ${input.name}` : ""},`;
  const intro =
    input.kind === 1
      ? `děkujeme za přihlášku č. ${input.year}/${input.id}. Zatím u ní neevidujeme úhradu celého startovného. Přihláška bude potvrzena po připsání platby na účet.`
      : `uzávěrka přihlášek${deadline ? ` byla ${deadline}` : " již proběhla"} a u přihlášky č. ${input.year}/${input.id} stále neevidujeme úhradu celého startovného. Prosíme o doplacení co nejdříve, nezaplacené přihlášky budou zrušeny.`;
  const partialNote =
    input.paid > 0
      ? `Děkujeme za dosavadní platby (${kc(input.paid)}). Zbývá doplatit ${kc(remaining)}.`
      : null;

  const p = (v: string) => `<p style="margin:0 0 16px">${v}</p>`;
  const th =
    'style="text-align:left;padding:6px 8px;border-bottom:2px solid #e2531c;font-size:13px;color:#5d6d63"';
  const td = 'style="padding:6px 8px;border-bottom:1px solid #e3e9e2;font-size:14px"';
  const rows = input.lines
    .map(
      (l) =>
        `<tr><td ${td}>${escapeHtml(l.runner)}</td><td ${td}>${escapeHtml(l.club)}</td><td ${td}>${escapeHtml(l.category)}</td><td ${td} align="right">${kc(l.fee)}</td></tr>`,
    )
    .join("");
  const totalsRow = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:4px 8px;font-size:14px">${label}</td><td align="right" style="padding:4px 8px;font-size:14px${bold ? ";font-weight:bold" : ""}">${value}</td></tr>`;
  const payRow = (label: string, value: string) =>
    `<tr><td style="padding:3px 12px 3px 0;font-size:14px;color:#5d6d63">${label}</td><td style="padding:3px 0;font-size:14px;font-weight:bold">${escapeHtml(value)}</td></tr>`;
  const link = (label: string, url: string) =>
    `<a href="${escapeHtml(url)}" style="color:#e2531c;font-weight:bold">${label}</a>`;
  const qr = qrImageUrl(input.site, input.year, input.id, remaining);

  const htmlBlocks = [
    p(escapeHtml(greeting)),
    p(escapeHtml(intro)),
    ...(partialNote ? [p(escapeHtml(partialNote))] : []),
    `<h2 style="margin:8px 0 8px;font-size:17px;color:#0f2a1c">Platební údaje</h2>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td valign="top" style="padding-right:20px"><table role="presentation" cellpadding="0" cellspacing="0">${payRow("K úhradě", kc(remaining))}${payRow("Číslo účtu", BANK_ACCOUNT)}${payRow("IBAN", BANK_IBAN)}${payRow("Variabilní symbol", vs)}${payRow("Zpráva pro příjemce", message)}</table></td><td valign="top"><img src="${escapeHtml(qr)}" width="150" height="150" alt="QR platba" style="display:block;border:1px solid #e3e9e2"></td></tr></table>`,
    p(
      `<span style="font-size:13px;color:#5d6d63">QR kód naskenujte v aplikaci své banky. Prosíme, uveďte variabilní symbol ${escapeHtml(vs)}, podle něj platbu automaticky přiřadíme.</span>`,
    ),
    `<h2 style="margin:8px 0 8px;font-size:17px;color:#0f2a1c">Rekapitulace přihlášky</h2>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px"><tr><th ${th}>Jméno</th><th ${th}>Klub</th><th ${th}>Kategorie</th><th ${th} align="right">Startovné</th></tr>${rows}</table>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px auto;background:#f7f9f6">${totalsRow("Startovné celkem", kc(input.fee))}${totalsRow("Zaplaceno", kc(input.paid))}${totalsRow("Zbývá zaplatit", kc(remaining), true)}</table>`,
    `<h2 style="margin:8px 0 8px;font-size:17px;color:#0f2a1c">Závod</h2>`,
    p(
      `<strong>${escapeHtml(date)}</strong>, ${escapeHtml(RACE_PLACE)}<br>Intervalový start od ${start}`,
    ),
    p(`Přihlášku můžete upravit v sekci ${link("Moje přihlášky", editUrl)}.`),
    p(`Pokud jste již zaplatili, považujte prosím tento e-mail za bezpředmětný.`),
    p(`Děkujeme a těšíme se na vás!<br>${escapeHtml(SIGNATURE)}`),
  ];

  const text = [
    greeting,
    "",
    intro,
    ...(partialNote ? ["", partialNote] : []),
    "",
    "Platební údaje:",
    `K úhradě: ${kc(remaining)}`,
    `Číslo účtu: ${BANK_ACCOUNT}`,
    `IBAN: ${BANK_IBAN}`,
    `Variabilní symbol: ${vs}`,
    `Zpráva pro příjemce: ${message}`,
    `QR platba: ${qr}`,
    "",
    "Rekapitulace přihlášky:",
    ...input.lines.map((l) => `- ${l.runner} · ${l.club} · ${l.category} · ${kc(l.fee)}`),
    "",
    `Startovné celkem: ${kc(input.fee)}`,
    `Zaplaceno: ${kc(input.paid)}`,
    `Zbývá zaplatit: ${kc(remaining)}`,
    "",
    `Závod: ${date}, ${RACE_PLACE}`,
    `Intervalový start od ${start}`,
    "",
    `Úprava přihlášky: ${editUrl}`,
    "",
    "Pokud jste již zaplatili, považujte prosím tento e-mail za bezpředmětný.",
    "",
    "Děkujeme a těšíme se na vás!",
    SIGNATURE,
  ].join("\n");

  return { subject, ...renderBrandedEmail({ subject, site: input.site, htmlBlocks, text }) };
}
