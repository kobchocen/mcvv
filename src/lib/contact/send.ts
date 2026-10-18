import { env } from "@/lib/env";
import { escapeHtml } from "@/lib/mail/layout";
import { sendResendEmail } from "@/lib/mail/resend";

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
    super("Contact form has no mail transport (RESEND_API_KEY + MAIL_FROM or SMTP_HOST).");
  }
}

export function buildContactMail(payload: ContactPayload) {
  const subject = `MCVV kontakt: ${payload.name}`;
  const text = `Jméno: ${payload.name}\nE-mail: ${payload.email}\n\n${payload.message}`;
  const html = `<p><strong>Jméno:</strong> ${escapeHtml(payload.name)}<br><strong>E-mail:</strong> ${escapeHtml(payload.email)}</p><p style="white-space:pre-wrap">${escapeHtml(payload.message)}</p>`;
  return { subject, text, html };
}

export async function sendContactMessage(
  payload: ContactPayload,
  transport: ContactTransport = { resend: sendResendEmail },
) {
  const to = env.CONTACT_TO;
  const { subject, text, html } = buildContactMail(payload);

  if (env.RESEND_API_KEY && env.MAIL_FROM) {
    const ok = await transport.resend({ to, subject, html, text, replyTo: payload.email });
    if (!ok) throw new Error("Resend delivery failed");
    return { delivered: true };
  }

  if (env.SMTP_HOST) {
    const nodemailer = await import("nodemailer");
    const port = env.SMTP_PORT ?? 587;
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    await transporter.sendMail({ from: env.SMTP_FROM ?? env.SMTP_USER ?? to, to, replyTo: payload.email, subject, text });
    return { delivered: true };
  }

  // Dříve se zpráva jen zalogovala a uživatel viděl „odesláno“ – zpráva se ztratila.
  throw new ContactNotConfiguredError();
}
