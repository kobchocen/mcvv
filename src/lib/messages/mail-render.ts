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

/** Přihláška se změnami (#130): popisek, odkaz do administrace a řádky změn. */
export type DigestChangeGroup = { label: string; url: string; lines: string[] };

function conversations(count: number): string {
  return `${count} ${
    count === 1 ? "nová konverzace" : count < 5 ? "nové konverzace" : "nových konverzací"
  }`;
}

/**
 * Denní souhrn pořadateli: sekce nepřečtených zpráv a sekce „Změny přihlášek“ (#130).
 * Prázdná sekce se vynechá; aspoň jedna musí mít položky.
 */
export function renderOrganizerDigest(input: {
  site: string;
  adminUrl: string;
  items: DigestItem[];
  changes?: DigestChangeGroup[];
  /** Přihlášky se změnami, které se do e-mailu nevešly. */
  changesMore?: number;
  registrationsUrl?: string;
}) {
  const changes = input.changes ?? [];
  const changedCount = changes.length + (input.changesMore ?? 0);
  const subject =
    input.items.length > 0 && changedCount > 0
      ? `MCVV: ${conversations(input.items.length)} se zprávami a změny přihlášek (${changedCount})`
      : input.items.length > 0
        ? `MCVV: ${conversations(input.items.length)} se zprávami od přihlašujících`
        : `MCVV: změny přihlášek (${changedCount})`;
  const heading = (title: string) =>
    `<h2 style="margin:0 0 12px;font-size:18px">${escapeHtml(title)}</h2>`;
  const blocks: string[] = [];
  const text: string[] = [];
  if (input.items.length > 0) {
    if (changes.length > 0) blocks.push(heading("Zprávy"));
    blocks.push(
      `<p style="margin:0 0 16px">Denní souhrn nepřečtených zpráv od přihlašujících:</p>`,
      `<ul style="margin:0 0 20px;padding-left:18px">${input.items
        .map(
          (item) =>
            `<li style="margin:0 0 12px"><a href="${escapeHtml(item.url)}" style="color:#e2531c;font-weight:bold">${escapeHtml(item.label)}</a> (${item.unread})<br><span style="color:#5d6d63;white-space:pre-wrap">${escapeHtml(item.excerpt)}</span></li>`,
        )
        .join("")}</ul>`,
      `<p style="margin:0 0 24px"><a href="${escapeHtml(input.adminUrl)}" style="color:#e2531c">Všechny zprávy v administraci</a></p>`,
    );
    text.push(
      ...(changes.length > 0 ? ["ZPRÁVY", ""] : []),
      "Denní souhrn nepřečtených zpráv od přihlašujících:",
      "",
      ...input.items.map(
        (item) => `- ${item.label} (${item.unread}): ${item.excerpt}\n  ${item.url}`,
      ),
      "",
      `Všechny zprávy: ${input.adminUrl}`,
      "",
    );
  }
  if (changes.length > 0) {
    blocks.push(
      heading("Změny přihlášek"),
      `<ul style="margin:0 0 20px;padding-left:18px">${changes
        .map(
          (group) =>
            `<li style="margin:0 0 12px"><a href="${escapeHtml(group.url)}" style="color:#e2531c;font-weight:bold">${escapeHtml(group.label)}</a><br><span style="color:#5d6d63">${group.lines.map((line) => escapeHtml(line)).join("<br>")}</span></li>`,
        )
        .join("")}</ul>`,
    );
    text.push(
      "ZMĚNY PŘIHLÁŠEK",
      "",
      ...changes.map(
        (group) =>
          `- ${group.label}\n${group.lines.map((line) => `  · ${line}`).join("\n")}\n  ${group.url}`,
      ),
      "",
    );
    if (input.changesMore) {
      const more = `… a další přihlášky se změnami: ${input.changesMore}`;
      blocks.push(`<p style="margin:0 0 16px">${escapeHtml(more)}</p>`);
      text.push(more, "");
    }
    if (input.registrationsUrl) {
      blocks.push(
        `<p style="margin:0"><a href="${escapeHtml(input.registrationsUrl)}" style="color:#e2531c">Přihlášky v administraci</a></p>`,
      );
      text.push(`Přihlášky: ${input.registrationsUrl}`);
    }
  }
  const rendered = renderBrandedEmail({
    subject,
    site: input.site,
    htmlBlocks: blocks,
    text: text.join("\n").trimEnd(),
    footer:
      "Souhrn posílá web závodu MCVV jednou denně, když jsou nové zprávy nebo změny přihlášek. Vypnout jde v nastavení administrace na",
  });
  return { subject, ...rendered };
}

export function excerpt(body: string, max = 200): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
