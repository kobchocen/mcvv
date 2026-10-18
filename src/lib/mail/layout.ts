/**
 * Shared HTML layout for transactional e-mails (verification, password reset).
 * Visually matches the newsletter template (feature/newsletter: renderNewsletter):
 * forest header with orange rule, white card, muted footer. Always paired with a text part.
 */

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export type TransactionalEmailInput = {
  subject: string;
  locale: string;
  site: string;
  paragraphs: string[];
  action: { label: string; url: string };
  after?: string[];
};

export function renderTransactionalEmail(input: TransactionalEmailInput): {
  html: string;
  text: string;
} {
  const lang = input.locale === "en" ? "en" : "cs";
  const site = escapeHtml(input.site);
  const url = escapeHtml(input.action.url);
  const paragraph = (value: string) => `<p style="margin:0 0 16px">${escapeHtml(value)}</p>`;
  const footer =
    lang === "en"
      ? "You received this e-mail because this address was used on"
      : "Tento e-mail jste dostali, protože tato adresa byla použita na";
  const ignore =
    lang === "en"
      ? "If it was not you, simply ignore this message."
      : "Pokud jste to nebyli vy, zprávu prosím ignorujte.";
  const fallback =
    lang === "en"
      ? "If the button does not work, copy this link into your browser:"
      : "Pokud tlačítko nefunguje, zkopírujte tento odkaz do prohlížeče:";
  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f6f1;font-family:Arial,Helvetica,sans-serif;color:#1d2a22">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6f1"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff">
<tr><td style="background:#0f2a1c;padding:20px 28px;border-bottom:4px solid #e2531c">
<a href="${site}" style="color:#ffffff;text-decoration:none;font-size:20px;font-weight:bold;letter-spacing:.5px">MCVV</a>
<span style="color:#b9cbbf;font-size:13px;padding-left:8px">Malá cena Velké Verandy</span>
</td></tr>
<tr><td style="padding:28px;font-size:16px;line-height:1.55">
${input.paragraphs.map(paragraph).join("\n")}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="background:#e2531c">
<a href="${url}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:bold">${escapeHtml(input.action.label)}</a>
</td></tr></table>
${(input.after ?? []).map(paragraph).join("\n")}
<p style="margin:0;font-size:13px;color:#5d6d63">${fallback}<br><a href="${url}" style="color:#e2531c;word-break:break-all">${url}</a></p>
</td></tr>
<tr><td style="padding:18px 28px;background:#f7f9f6;color:#5d6d63;font-size:12px;line-height:1.5">
${footer} <a href="${site}" style="color:#5d6d63">mcvv.org</a>. ${ignore}
</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    ...input.paragraphs,
    "",
    `${input.action.label}: ${input.action.url}`,
    ...(input.after && input.after.length > 0 ? ["", ...input.after] : []),
    "",
    "--",
    `MCVV · Malá cena Velké Verandy · ${input.site}`,
    "",
  ].join("\n");
  return { html, text };
}

export type BrandedEmailInput = {
  subject: string;
  site: string;
  /** Pre-rendered, already escaped HTML blocks placed inside the white card. */
  htmlBlocks: string[];
  text: string;
  footer?: string;
};

/** Same frame as renderTransactionalEmail, but with free-form content (entry confirmation etc.). */
export function renderBrandedEmail(input: BrandedEmailInput): { html: string; text: string } {
  const site = escapeHtml(input.site);
  const footer =
    input.footer ?? "Tento e-mail jste dostali, protože jste se přihlásili na závod MCVV na";
  const html = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f6f1;font-family:Arial,Helvetica,sans-serif;color:#1d2a22">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6f1"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff">
<tr><td style="background:#0f2a1c;padding:20px 28px;border-bottom:4px solid #e2531c">
<a href="${site}" style="color:#ffffff;text-decoration:none;font-size:20px;font-weight:bold;letter-spacing:.5px">MCVV</a>
<span style="color:#b9cbbf;font-size:13px;padding-left:8px">Malá cena Velké Verandy</span>
</td></tr>
<tr><td style="padding:28px;font-size:16px;line-height:1.55">
${input.htmlBlocks.join("\n")}
</td></tr>
<tr><td style="padding:18px 28px;background:#f7f9f6;color:#5d6d63;font-size:12px;line-height:1.5">
${escapeHtml(footer)} <a href="${site}" style="color:#5d6d63">mcvv.org</a>.
</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${input.text.trimEnd()}\n\n--\nMCVV · Malá cena Velké Verandy · ${input.site}\n`;
  return { html, text };
}
