import { env } from "@/lib/env";
import {
  mailAllowlist,
  maskRecipient,
  recipientAllowed,
  SKIPPED_PROVIDER_ID,
} from "@/lib/mail/allowlist";
import { mailConfigured, mailProvider } from "@/lib/mail/configured";
import { sendSesBatch } from "@/lib/mail/ses";

import type { BatchSendResult, OutgoingMessage } from "./core";

/** Velikost dávky newsletteru (Resend batch max. 100; SES posílá stejnou dávku po jednom). */
export const NEWSLETTER_BATCH_SIZE = 50;
/** Pauza mezi dávkami v klientské smyčce (Resend 2 req/s; u SES platí ještě limiter v transportu). */
export const NEWSLETTER_BATCH_PAUSE_MS = 700;

export function newsletterDryRun(): boolean {
  if (env.NEWSLETTER_DRY_RUN) {
    return env.NEWSLETTER_DRY_RUN === "true";
  }
  return env.NODE_ENV !== "production";
}

export function newsletterMailConfigured(): boolean {
  return mailConfigured();
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
      const mapAllowed = (
        ids: (string | null | undefined)[] | undefined,
        unsent: string | null | undefined,
      ) => {
        let next = 0;
        return messages.map((m) =>
          recipientAllowed(m.to, allow) ? (ids?.[next++] ?? unsent) : SKIPPED_PROVIDER_ID,
        );
      };
      if (!sent.ok) {
        return {
          ok: false,
          retryable: sent.retryable,
          error: sent.error,
          sentProviderIds: mapAllowed(sent.sentProviderIds, undefined),
        };
      }
      return {
        ok: true,
        providerIds: mapAllowed(sent.providerIds, null).map((id) => id ?? null),
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
  if (mailProvider() === "ses") {
    return sendSesBatch(messages, { dryRun: options.dryRun });
  }
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
