/**
 * Odesílání přes Amazon SES API v2 (`SendEmail`, ne `SendBulkEmail`).
 * Rychlost je omezená pod výchozí limit účtu 14 e-mailů/s.
 */
import { SendEmailCommand, SESv2Client, type SendEmailCommandInput } from "@aws-sdk/client-sesv2";

import { env } from "@/lib/env";

import { mailAllowlist, maskRecipient, recipientAllowed, SKIPPED_PROVIDER_ID } from "./allowlist";
import { sesConfigured } from "./configured";
import type { SendResult } from "./queue-core";

export const DEFAULT_SES_REGION = "eu-central-1";
export const DEFAULT_SES_MAX_PER_SECOND = 10;
export const SES_ACCOUNT_MAX_PER_SECOND = 14;

export type SesMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

export type SesClient = {
  send: (command: SendEmailCommand) => Promise<{ MessageId?: string }>;
};

export type ProviderBatchResult =
  | { ok: true; providerIds: (string | null)[] }
  | {
      ok: false;
      retryable: boolean;
      error: string;
      sentProviderIds?: (string | null | undefined)[];
    };

export function sesRegion(): string {
  return env.AWS_REGION ?? DEFAULT_SES_REGION;
}

/** 1–14, výchozí 10 (bezpečně pod limitem 14/s). */
export function sesMaxPerSecond(raw = env.MAIL_SES_MAX_PER_SECOND): number {
  const value = Number(raw ?? "");
  if (!Number.isInteger(value) || value < 1) return DEFAULT_SES_MAX_PER_SECOND;
  return Math.min(value, SES_ACCOUNT_MAX_PER_SECOND);
}

export function createMinIntervalLimiter(
  maxPerSecond: number,
  deps: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
) {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const interval = 1000 / maxPerSecond;
  let nextAt = 0;
  return async function acquire() {
    const t = now();
    const start = Math.max(t, nextAt);
    nextAt = start + interval;
    const wait = start - t;
    if (wait > 0) await sleep(wait);
  };
}

let sharedLimiter: (() => Promise<void>) | undefined;
let sharedClient: SesClient | undefined;

function defaultLimiter(): () => Promise<void> {
  sharedLimiter ??= createMinIntervalLimiter(sesMaxPerSecond());
  return sharedLimiter;
}

function defaultClient(): SesClient {
  sharedClient ??= new SESv2Client({ region: sesRegion() });
  return sharedClient;
}

export function buildSendEmailInput(message: SesMessage, from: string): SendEmailCommandInput {
  const headers = Object.entries(message.headers ?? {})
    .filter(([name, value]) => name.trim() && value.trim())
    .map(([Name, Value]) => ({ Name, Value }));
  return {
    FromEmailAddress: from,
    Destination: { ToAddresses: [message.to] },
    ...(message.replyTo ? { ReplyToAddresses: [message.replyTo] } : {}),
    Content: {
      Simple: {
        Subject: { Data: message.subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: message.text, Charset: "UTF-8" },
          Html: { Data: message.html, Charset: "UTF-8" },
        },
        ...(headers.length > 0 ? { Headers: headers } : {}),
      },
    },
  };
}

/**
 * Rozliší chybu SES. Throttling / 5xx / síť = opakovat, denní kvóta = počkat do dalšího dne,
 * ostatní 4xx = trvalá chyba. Bez automatického přepnutí na Resend.
 */
export function classifySesFailure(error: unknown): Extract<SendResult, { ok: false }> {
  const err = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const name = typeof err.name === "string" ? err.name : "";
  const rawMessage =
    typeof err.message === "string"
      ? err.message
      : error instanceof Error
        ? error.message
        : String(error);
  const message = rawMessage.slice(0, 300);
  const metadata =
    err.$metadata && typeof err.$metadata === "object"
      ? (err.$metadata as Record<string, unknown>)
      : {};
  const status = typeof metadata.httpStatusCode === "number" ? metadata.httpStatusCode : undefined;
  const text = `${name} ${message}`;
  const label = `SES ${(status ?? name) || "chyba"}: ${message}`;

  if (/AccountSendingPaused|SendingPaused/i.test(text)) {
    return { ok: false, kind: "permanent", error: label };
  }
  if (/quota exceeded|SendingQuotaExceeded|DailySendQuota/i.test(text)) {
    return { ok: false, kind: "quota", error: label };
  }
  if (
    status === 429 ||
    (status !== undefined && status >= 500) ||
    /TooManyRequests|Throttl|Timeout|ServiceUnavailable|ECONNRESET|ENETUNREACH|EAI_AGAIN|NetworkingError/i.test(
      text,
    )
  ) {
    return { ok: false, kind: "retryable", error: label };
  }
  return { ok: false, kind: "permanent", error: label };
}

export async function postSesEmail(
  input: SesMessage,
  options: {
    dryRun: boolean;
    client?: SesClient;
    rateLimit?: () => Promise<void>;
  },
): Promise<SendResult> {
  if (!recipientAllowed(input.to, mailAllowlist())) {
    console.info(
      `[mail] skipped (MAIL_ALLOWED_RECIPIENTS): ${maskRecipient(input.to)} "${input.subject}"`,
    );
    return { ok: true, providerId: SKIPPED_PROVIDER_ID };
  }
  if (options.dryRun) {
    console.info(`[mail] dry-run: "${input.subject}"`);
    return { ok: true, providerId: "dry-run" };
  }
  if (!env.MAIL_FROM || !sesConfigured()) {
    return { ok: false, kind: "permanent", error: "SES není nakonfigurován" };
  }
  await (options.rateLimit ?? defaultLimiter())();
  try {
    const response = await (options.client ?? defaultClient()).send(
      new SendEmailCommand(buildSendEmailInput(input, env.MAIL_FROM)),
    );
    return { ok: true, providerId: response.MessageId ?? null };
  } catch (error) {
    const result = classifySesFailure(error);
    console.error("[ses] send failed", result.ok ? "ok" : result.kind);
    return result;
  }
}

/**
 * Newsletter po jednom `SendEmail` (IAM nepovoluje SendBulkEmail).
 * Při částečném úspěchu vrací `sentProviderIds`, aby se už odeslané řádky neposílaly znovu.
 */
export async function sendSesBatch(
  messages: SesMessage[],
  options: {
    dryRun: boolean;
    client?: SesClient;
    rateLimit?: () => Promise<void>;
  },
): Promise<ProviderBatchResult> {
  const providerIds: (string | null | undefined)[] = messages.map(() => undefined);
  let firstError: { retryable: boolean; error: string } | null = null;
  let sent = 0;
  for (let i = 0; i < messages.length; i++) {
    const result = await postSesEmail(messages[i]!, options);
    if (result.ok) {
      providerIds[i] = result.providerId;
      sent += 1;
      continue;
    }
    firstError ??= {
      retryable: result.kind !== "permanent",
      error: result.error,
    };
    // Trvalá chyba u jednoho adresáta nemá zablokovat zbytek dávky.
    if (result.kind === "permanent") continue;
    break;
  }
  if (!firstError) {
    return { ok: true, providerIds: providerIds.map((id) => id ?? null) };
  }
  if (sent === 0) {
    return { ok: false, retryable: firstError.retryable, error: firstError.error };
  }
  return {
    ok: false,
    retryable: firstError.retryable,
    error: firstError.error,
    sentProviderIds: providerIds,
  };
}
