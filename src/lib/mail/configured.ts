/**
 * Výběr e-mailového poskytovatele. Žádný automatický failover: přepínač
 * `MAIL_PROVIDER` je jen ruční (ses | resend, výchozí resend).
 */
import { env } from "@/lib/env";

export type MailProviderName = "ses" | "resend";

export function mailProvider(): MailProviderName {
  return env.MAIL_PROVIDER === "ses" ? "ses" : "resend";
}

export function sesConfigured(): boolean {
  return Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
}

export function resendConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/** MAIL_FROM plus údaje zvoleného poskytovatele (SES klíče, nebo Resend API klíč). */
export function mailConfigured(): boolean {
  if (!env.MAIL_FROM) return false;
  return mailProvider() === "ses" ? sesConfigured() : resendConfigured();
}
