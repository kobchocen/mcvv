import { env } from "@/lib/env";

export type ContactPayload = {
  name: string;
  email: string;
  message: string;
};

export async function sendContactMessage(payload: ContactPayload) {
  const to = env.CONTACT_TO;
  const subject = `MCVV kontakt: ${payload.name}`;
  const text = `Jméno: ${payload.name}\nE-mail: ${payload.email}\n\n${payload.message}`;

  if (!env.SMTP_HOST) {
    console.info("[contact] SMTP is not configured; message logged only.", {
      to,
      subject,
      text,
    });
    return { delivered: false };
  }

  const nodemailer = await import("nodemailer");
  const port = env.SMTP_PORT ?? 587;
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
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
