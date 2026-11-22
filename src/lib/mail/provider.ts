/**
 * Jediné místo, které podle MAIL_PROVIDER volá SES nebo Resend pro jednotlivé e-maily.
 * Bez automatického failoveru: když zvolený poskytovatel selže, e-mail zůstane ve frontě.
 */
import { mailProvider } from "./configured";
import type { SendResult } from "./queue-core";
import { postResendEmail, type ResendMessage } from "./resend";
import { postSesEmail } from "./ses";
import { mailBlockedInTest } from "./test-block";

export { mailConfigured, mailProvider } from "./configured";

export type ProviderMessage = ResendMessage & { headers?: Record<string, string> };

export async function postProviderEmail(
  input: ProviderMessage,
  options: { dryRun: boolean; idempotencyKey?: string; fetchImpl?: typeof fetch },
): Promise<SendResult> {
  if (mailBlockedInTest("provider")) return { ok: true, providerId: null };
  if (mailProvider() === "ses") {
    return postSesEmail(input, { dryRun: options.dryRun });
  }
  return postResendEmail(input, options);
}
