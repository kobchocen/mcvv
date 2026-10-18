import { appOrigin } from "@/lib/auth/tokens";
import { mailConfigured, sendResendEmail } from "@/lib/mail/resend";

import { renderEntryConfirmation } from "./confirm-mail-render";

/** Sent only after the entry is paid (status paid/overpaid → confirmed). */
export async function sendConfirmationEmail(input: {
  year: number;
  id: number;
  email: string | null | undefined;
  name: string | null | undefined;
  lines: { runner: string; club: string; category: string; fee: number }[];
  fee: number;
  paid: number;
  /** Origin pro odkazy; bez něj se odvodí z požadavku. */
  site?: string;
}): Promise<boolean> {
  if (!input.email || !mailConfigured()) {
    return false;
  }
  const site = input.site ?? (await appOrigin());
  const { subject, html, text } = renderEntryConfirmation({ ...input, email: input.email, site });
  return sendResendEmail({ to: input.email, subject, text, html, kind: "confirmation" });
}
