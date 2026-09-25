import { env } from "@/lib/env";

export function mailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
}

export async function sendResendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    return false;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (!response.ok) {
    console.error("[resend] send failed", response.status, await response.text());
    return false;
  }
  return true;
}
