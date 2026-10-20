/**
 * E-maily ke zprávám (čisté funkce). Texty jsou česky stejně jako ostatní transakční e-maily.
 */
import { escapeHtml, renderBrandedEmail, renderTransactionalEmail } from "@/lib/mail/layout";

export function renderUserNotification(input: {
  site: string;
  threadUrl: string;
  label: string;
  body: string;
}) {
  const subject = `MCVV: nová zpráva od pořadatele – ${input.label}`.slice(0, 300);
  const excerpt = input.body.length > 1200 ? `${input.body.slice(0, 1199)}…` : input.body;
  const { html, text } = renderTransactionalEmail({
    subject,
    locale: "cs",
    site: input.site,
    paragraphs: [`Pořadatel Malé ceny Velké Verandy vám poslal zprávu (${input.label}):`, excerpt],
    action: { label: "Zobrazit a odpovědět", url: input.threadUrl },
    after: [
      "Na tento e-mail prosím neodpovídejte, odpovězte přímo na webu. Další upozornění pošleme, až zprávu potvrdíte jako přečtenou nebo odpovíte.",
    ],
  });
  return { subject, html, text };
}

export type DigestItem = { label: string; excerpt: string; url: string; unread: number };

export function renderOrganizerDigest(input: {
  site: string;
  adminUrl: string;
  items: DigestItem[];
}) {
  const subject = `MCVV: ${input.items.length} ${
    input.items.length === 1
      ? "nová konverzace"
      : input.items.length < 5
        ? "nové konverzace"
        : "nových konverzací"
  } se zprávami od přihlašujících`;
  const blocks = [
    `<p style="margin:0 0 16px">Denní souhrn nepřečtených zpráv od přihlašujících:</p>`,
    `<ul style="margin:0 0 20px;padding-left:18px">${input.items
      .map(
        (item) =>
          `<li style="margin:0 0 12px"><a href="${escapeHtml(item.url)}" style="color:#e2531c;font-weight:bold">${escapeHtml(item.label)}</a> (${item.unread})<br><span style="color:#5d6d63;white-space:pre-wrap">${escapeHtml(item.excerpt)}</span></li>`,
      )
      .join("")}</ul>`,
    `<p style="margin:0"><a href="${escapeHtml(input.adminUrl)}" style="color:#e2531c">Všechny zprávy v administraci</a></p>`,
  ];
  const text = [
    "Denní souhrn nepřečtených zpráv od přihlašujících:",
    "",
    ...input.items.map(
      (item) => `- ${item.label} (${item.unread}): ${item.excerpt}\n  ${item.url}`,
    ),
    "",
    `Všechny zprávy: ${input.adminUrl}`,
  ].join("\n");
  const rendered = renderBrandedEmail({
    subject,
    site: input.site,
    htmlBlocks: blocks,
    text,
    footer:
      "Souhrn posílá web závodu MCVV jednou denně, když jsou nové zprávy. Vypnout jde v nastavení administrace na",
  });
  return { subject, ...rendered };
}

export function excerpt(body: string, max = 200): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
