import { env } from "@/lib/env";

import {
  mailAllowlist,
  maskRecipient,
  recipientAllowed,
  SKIPPED_PROVIDER_ID,
} from "@/lib/mail/allowlist";

import type { BatchSendResult, OutgoingMessage } from "./core";

/** Resend batch API accepts up to 100 messages per request (1 request toward the rate limit). */
export const NEWSLETTER_BATCH_SIZE = 50;
/** Pause between batches in the client loop (Resend default limit: 2 requests/s). */
export const NEWSLETTER_BATCH_PAUSE_MS = 700;

export function newsletterDryRun(): boolean {
  if (env.NEWSLETTER_DRY_RUN) {
    return env.NEWSLETTER_DRY_RUN === "true";
  }
  return env.NODE_ENV !== "production";
}

export function newsletterMailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
}

/**
 * Odešle dávku; příjemci mimo `MAIL_ALLOWED_RECIPIENTS` (Q347) se přeskočí a zalogují
 * (providerId „skipped-allowlist“), ostatní odejdou normálně.
 */
export async function sendNewsletterBatch(
  messages: OutgoingMessage[],
  idempotencyKey: string,
  options: { dryRun: boolean },
): Promise<BatchSendResult> {
  const allow = mailAllowlist();
  if (allow) {
    const allowed = messages.filter((m) => recipientAllowed(m.to, allow));
    if (allowed.length < messages.length) {
      for (const m of messages) {
        if (!recipientAllowed(m.to, allow)) {
          console.info(
            `[newsletter] skipped (MAIL_ALLOWED_RECIPIENTS): ${maskRecipient(m.to)} (${idempotencyKey})`,
          );
        }
      }
      const sent =
        allowed.length > 0
          ? await sendBatch(allowed, `${idempotencyKey}-allowed`, options)
          : { ok: true as const, providerIds: [] };
      if (!sent.ok) return sent;
      let next = 0;
      return {
        ok: true,
        providerIds: messages.map((m) =>
          recipientAllowed(m.to, allow) ? (sent.providerIds[next++] ?? null) : SKIPPED_PROVIDER_ID,
        ),
      };
    }
  }
  return sendBatch(messages, idempotencyKey, options);
}

async function sendBatch(
  messages: OutgoingMessage[],
  idempotencyKey: string,
  options: { dryRun: boolean },
): Promise<BatchSendResult> {
  if (options.dryRun) {
    console.info(`[newsletter] dry-run: ${messages.length} zpráv (${idempotencyKey})`);
    return { ok: true, providerIds: messages.map(() => "dry-run") };
  }
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    return { ok: false, retryable: false, error: "Resend není nakonfigurován" };
  }
  try {
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(
        messages.map((m) => ({
          from: env.MAIL_FROM,
          to: [m.to],
          subject: m.subject,
          html: m.html,
          text: m.text,
          headers: m.headers,
        })),
      ),
    });
    if (response.status === 429) {
      const body = (await response.text()).slice(0, 300);
      const quota = /quota/i.test(body);
      return {
        ok: false,
        retryable: true,
        error: quota ? `Resend 429 (kvóta): ${body}` : "Resend 429",
      };
    }
    if (response.status >= 500) {
      return { ok: false, retryable: true, error: `Resend ${response.status}` };
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      return { ok: false, retryable: false, error: `Resend ${response.status}: ${detail}` };
    }
    const json = (await response.json()) as { data?: { id?: string }[] };
    return { ok: true, providerIds: messages.map((_m, i) => json.data?.[i]?.id ?? null) };
  } catch (error) {
    return { ok: false, retryable: true, error: `síťová chyba: ${String(error).slice(0, 200)}` };
  }
}
