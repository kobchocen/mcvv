import { env } from "@/lib/env";

import { classifyResendFailure, type MailKind, type SendResult } from "./queue-core";

export function mailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
}

export type ResendMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

/** Jediné místo, které skutečně volá Resend pro jednotlivé e-maily. Volá ho jen fronta. */
export async function postResendEmail(
  input: ResendMessage,
  options: { dryRun: boolean; idempotencyKey?: string; fetchImpl?: typeof fetch },
): Promise<SendResult> {
  if (options.dryRun) {
    console.info(`[mail] dry-run: "${input.subject}" (${options.idempotencyKey ?? "-"})`);
    return { ok: true, providerId: "dry-run" };
  }
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    return { ok: false, kind: "permanent", error: "Resend není nakonfigurován" };
  }
  try {
    const response = await (options.fetchImpl ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    });
    if (!response.ok) {
      const result = classifyResendFailure(response.status, await response.text());
      console.error("[resend] send failed", response.status);
      return result;
    }
    const json = (await response.json().catch(() => ({}))) as { id?: string };
    return { ok: true, providerId: json.id ?? null };
  } catch (error) {
    return { ok: false, kind: "retryable", error: `síťová chyba: ${String(error).slice(0, 200)}` };
  }
}

/**
 * Zpětně kompatibilní API pro stávající volající: e-mail jde přes frontu.
 * true = odesláno nebo zařazeno k pozdějšímu odeslání (denní limit), false = chyba.
 */
export async function sendResendEmail(
  input: ResendMessage & { kind?: MailKind },
): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    return false;
  }
  const { sendMail } = await import("./queue");
  const { kind = "other", ...message } = input;
  return (await sendMail({ ...message, kind })) !== "failed";
}
