import { env } from "@/lib/env";

/**
 * Povolení příjemci (Q347): když je nastavené `MAIL_ALLOWED_RECIPIENTS`, odcházejí e-maily jen na
 * vyjmenované adresy nebo domény (`@example.cz`); ostatní se přeskočí a jen zalogují. Určeno pro
 * STG, kde jsou v databázi i skutečné adresy běžců. Nenastaveno / prázdné = bez omezení.
 * Hodnota bez jediné platné položky (např. jen „,“) blokuje vše.
 */
export type RecipientAllowlist = { emails: Set<string>; domains: Set<string> } | null;

export function parseAllowedRecipients(raw: string | undefined): RecipientAllowlist {
  if (raw === undefined || raw.trim() === "") return null;
  const emails = new Set<string>();
  const domains = new Set<string>();
  for (const item of raw.split(/[\s,;]+/)) {
    const value = item.trim().toLowerCase();
    if (!value) continue;
    if (value.startsWith("@") && value.length > 1) domains.add(value.slice(1));
    else if (/^[^@\s]+@[^@\s]+$/.test(value)) emails.add(value);
  }
  return { emails, domains };
}

export function recipientAllowed(to: string, allow: RecipientAllowlist): boolean {
  if (!allow) return true;
  const email = to.trim().toLowerCase();
  if (allow.emails.has(email)) return true;
  const at = email.lastIndexOf("@");
  return at > 0 && allow.domains.has(email.slice(at + 1));
}

/** Adresa do logu bez celé místní části (j…@example.cz). */
export function maskRecipient(to: string): string {
  const email = to.trim();
  const at = email.lastIndexOf("@");
  if (at <= 0) return "…";
  return `${email.slice(0, 1)}…${email.slice(at)}`;
}

export function mailAllowlist(): RecipientAllowlist {
  return parseAllowedRecipients(env.MAIL_ALLOWED_RECIPIENTS);
}

/** providerId u přeskočeného e-mailu (fronta ho označí jako vyřízený, neopakuje ho). */
export const SKIPPED_PROVIDER_ID = "skipped-allowlist";
