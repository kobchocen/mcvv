import { getEditionStart, RACE_START_HOUR, RACE_START_MINUTE } from "@/lib/date/race-schedule";
import { escapeHtml, renderBrandedEmail } from "@/lib/mail/layout";

export type ConfirmationInput = {
  year: number;
  id: number;
  email: string;
  name: string | null | undefined;
  lines: { runner: string; club: string; category: string; fee: number }[];
  fee: number;
  paid: number;
  site: string;
};

export const RACE_PLACE = "Velká Veranda, Choceň";
export const SIGNATURE = "Tým pořadatelů z K.O.B. Choceň";
export const RECEIPT_NOTE = "Doklad o zaplacení startovného (PDF) si stáhnete v sekci";
/** Řádek potvrzení přihlášky se startovným 0 Kč (vítězové, veteráni, pořadatelé). */
export const FREE_ENTRY_NOTE = "Startovné neplatíte.";

const kc = (value: number) => `${value.toLocaleString("cs-CZ").replace(/\u00a0/g, " ")} Kč`;

export function raceDateLabel(year: number): string {
  const d = getEditionStart(year);
  const parts = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("day")}. ${get("month")}. ${get("year")}`;
}

export function renderEntryConfirmation(input: ConfirmationInput) {
  const subject = `Potvrzení přihlášky ${input.year}/${input.id}`;
  const greeting = `Dobrý den${input.name ? `, ${input.name}` : ""},`;
  const free = input.fee === 0 && input.paid === 0;
  const intro = free
    ? `děkujeme za přihlášku. Vaše přihláška č. ${input.year}/${input.id} je potvrzená.`
    : `děkujeme za přihlášku a platbu. Vaše přihláška č. ${input.year}/${input.id} je potvrzená.`;
  const remaining = Math.max(0, input.fee - input.paid);
  const start = `${RACE_START_HOUR}:${String(RACE_START_MINUTE).padStart(2, "0")}`;
  const date = raceDateLabel(input.year);
  const editUrl = `${input.site}/prihlasky`;
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
  const link = (label: string, url: string) =>
    `<a href="${escapeHtml(url)}" style="color:#e2531c;font-weight:bold">${label}</a>`;

  const htmlBlocks = [
    p(escapeHtml(greeting)),
    p(escapeHtml(intro)),
    `<h2 style="margin:8px 0 8px;font-size:17px;color:#0f2a1c">Přihlášení závodníci</h2>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px"><tr><th ${th}>Jméno</th><th ${th}>Klub</th><th ${th}>Kategorie</th><th ${th} align="right">Startovné</th></tr>${rows}</table>`,
    free
      ? p(`<strong>${escapeHtml(FREE_ENTRY_NOTE)}</strong>`)
      : `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px auto;background:#f7f9f6">${totalsRow("Startovné celkem", kc(input.fee))}${totalsRow("Zaplaceno", kc(input.paid))}${totalsRow("Zbývá zaplatit", kc(remaining), true)}</table>`,
    `<h2 style="margin:8px 0 8px;font-size:17px;color:#0f2a1c">Závod</h2>`,
    p(
      `<strong>${escapeHtml(date)}</strong>, ${escapeHtml(RACE_PLACE)}<br>Intervalový start od ${start}`,
    ),
    p(`Přihlášku můžete upravit v sekci ${link("Moje přihlášky", editUrl)}.`),
    ...(free ? [] : [p(`${RECEIPT_NOTE} ${link("Moje přihlášky", editUrl)}.`)]),
    p(`Těšíme se na vás!<br>${escapeHtml(SIGNATURE)}`),
  ];

  const text = [
    greeting,
    "",
    intro,
    "",
    "Přihlášení závodníci:",
    ...input.lines.map((l) => `- ${l.runner} · ${l.club} · ${l.category} · ${kc(l.fee)}`),
    "",
    ...(free
      ? [FREE_ENTRY_NOTE]
      : [
          `Startovné celkem: ${kc(input.fee)}`,
          `Zaplaceno: ${kc(input.paid)}`,
          `Zbývá zaplatit: ${kc(remaining)}`,
        ]),
    "",
    `Závod: ${date}, ${RACE_PLACE}, intervalový start od ${start}`,
    "",
    `Úprava přihlášky: ${editUrl}`,
    ...(free ? [] : [`${RECEIPT_NOTE} ${editUrl}`]),
    "",
    "Těšíme se na vás!",
    SIGNATURE,
  ].join("\n");

  return { subject, ...renderBrandedEmail({ subject, site: input.site, htmlBlocks, text }) };
}
