import { createHmac, timingSafeEqual } from "node:crypto";

import { RateLimiter } from "@/lib/auth/password-reset";
import { LIMITS } from "@/lib/contact/limits";

/** Minimální doba vyplnění formuláře – rychlejší odeslání je téměř jistě bot. */
export const MIN_FILL_MS = 3_000;
/** Token formuláře platí 6 hodin (pak stačí obnovit stránku). */
export const MAX_TOKEN_AGE_MS = 6 * 60 * 60 * 1000;

export { LIMITS };

const RATE_WINDOW_MS = 60 * 60 * 1000;
// In-memory limity: platí per replika (při N replikách je efektivní limit N×).
// Pro malý web je to dostatečné; denní strop Resendu (mail queue) je poslední pojistka.
export const contactPerIp = new RateLimiter(5, RATE_WINDOW_MS);
export const contactPerEmail = new RateLimiter(3, RATE_WINDOW_MS);
export const contactGlobal = new RateLimiter(30, RATE_WINDOW_MS);

function mac(body: string, secret: string): string {
  return createHmac("sha256", secret).update(`contact-form:${body}`).digest("base64url");
}

export function issueFormToken(secret: string, now = Date.now()): string {
  const body = String(now);
  return `${body}.${mac(body, secret)}`;
}

export type TokenCheck = "ok" | "invalid" | "too-fast" | "expired";

export function verifyFormToken(token: string, secret: string, now = Date.now()): TokenCheck {
  const dot = token.indexOf(".");
  if (dot <= 0 || token.length > 128) return "invalid";
  const body = token.slice(0, dot);
  if (!/^\d{10,16}$/.test(body)) return "invalid";
  const left = Buffer.from(token.slice(dot + 1));
  const right = Buffer.from(mac(body, secret));
  if (left.length !== right.length || !timingSafeEqual(left, right)) return "invalid";
  const age = now - Number(body);
  if (age < MIN_FILL_MS) return "too-fast";
  if (age > MAX_TOKEN_AGE_MS) return "expired";
  return "ok";
}

export type ContactInput = { name: string; email: string; message: string };

const EMAIL_RE = /^[^\s@<>"',;:()[\]\\]+@[^\s@<>"',;:()[\]\\]+\.[^\s@<>"',;:()[\]\\]+$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/** Striktní validace; jméno a e-mail nesmí obsahovat řídicí znaky (CR/LF → header injection). */
export function validateContactInput(raw: {
  name: unknown;
  email: unknown;
  message: unknown;
}): ContactInput | null {
  if (typeof raw.name !== "string" || typeof raw.email !== "string") return null;
  if (typeof raw.message !== "string") return null;
  // Délku kontrolujeme i před trimem, aby obří payload neprošel zpracováním.
  if (raw.name.length > LIMITS.nameMax * 2 || raw.email.length > LIMITS.emailMax * 2) return null;
  if (raw.message.length > LIMITS.messageMax * 2) return null;
  const name = raw.name.trim();
  const email = raw.email.trim();
  const message = raw.message.trim().replace(/\r\n?/g, "\n");
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax || CONTROL_RE.test(name)) {
    return null;
  }
  if (email.length > LIMITS.emailMax || CONTROL_RE.test(email) || !EMAIL_RE.test(email)) {
    return null;
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)) return null;
  if (message.length < LIMITS.messageMin || message.length > LIMITS.messageMax) return null;
  return { name, email, message };
}
