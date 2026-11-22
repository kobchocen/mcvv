import { mailAllowlist, maskRecipient, recipientAllowed } from "@/lib/mail/allowlist";
import { env } from "@/lib/env";
import { escapeHtml } from "@/lib/mail/layout";
import { mailConfigured } from "@/lib/mail/configured";
import { sendResendEmail } from "@/lib/mail/resend";
import { siteUrl } from "@/lib/site/url";

import { questionAdminUrl } from "./questions-core";

export type ContactPayload = {
  name: string;
  email: string;
  message: string;
};

export type ContactTransport = {
  resend: (input: {
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
  }) => Promise<boolean>;
};

export class ContactNotConfiguredError extends Error {
  constructor() {
    super("Contact form has no mail transport (MAIL_FROM + provider credentials, or SMTP_HOST).");
  }
}

export function buildContactMail(payload: ContactPayload, adminUrl?: string | null) {
  const subject = `MCVV kontakt: ${payload.name}`;
  // #205: odkaz na dotaz v administraci, kde se dá odpovědět a sledovat stav
  const link = adminUrl ? `\n\nOdpovědět v administraci: ${adminUrl}` : "";
  const text = `Jméno: ${payload.name}\nE-mail: ${payload.email}\n\n${payload.message}${link}`;
  const linkHtml = adminUrl
    ? `<p><a href="${escapeHtml(adminUrl)}">Odpovědět v administraci</a></p>`
    : "";
  const html = `<p><strong>Jméno:</strong> ${escapeHtml(payload.name)}<br><strong>E-mail:</strong> ${escapeHtml(payload.email)}</p><p style="white-space:pre-wrap">${escapeHtml(payload.message)}</p>${linkHtml}`;
  return { subject, text, html };
}

/**
 * Odešle zprávu z kontaktního formuláře (nepřihlášený návštěvník) na pořadatelský e-mail.
 * `recipient` dodává volající z getOrganizerEmail() (nastavení → CONTACT_TO → mcvv@mcvv.org).
 */
export async function sendContactMessage(
  payload: ContactPayload,
  transport: ContactTransport = { resend: (m) => sendResendEmail({ ...m, kind: "contact" }) },
  recipient?: string,
  /** Id uloženého dotazu (#205) – upozornění pak odkazuje do administrace. */
  questionId?: number | null,
) {
  const to = recipient ?? env.CONTACT_TO;
  const adminUrl = questionId != null ? questionAdminUrl(siteUrl(), questionId) : null;
  const { subject, text, html } = buildContactMail(payload, adminUrl);

  if (mailConfigured()) {
    const ok = await transport.resend({ to, subject, html, text, replyTo: payload.email });
    if (!ok) throw new Error("Odeslání e-mailu selhalo");
    return { delivered: true };
  }

  if (env.SMTP_HOST) {
    // Q347: SMTP záloha respektuje MAIL_ALLOWED_RECIPIENTS stejně jako hlavní poskytovatel.
    if (!recipientAllowed(to, mailAllowlist())) {
      console.info(`[contact] skipped (MAIL_ALLOWED_RECIPIENTS): ${maskRecipient(to)}`);
      return { delivered: true };
    }
    const nodemailer = await import("nodemailer");
    const port = env.SMTP_PORT ?? 587;
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth:
        env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    await transporter.sendMail({
      from: env.SMTP_FROM ?? env.SMTP_USER ?? to,
      to,
      replyTo: payload.email,
      subject,
      text,
    });
    return { delivered: true };
  }

  // Dříve se zpráva jen zalogovala a uživatel viděl „odesláno“ – zpráva se ztratila.
  throw new ContactNotConfiguredError();
}
