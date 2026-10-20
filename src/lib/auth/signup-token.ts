import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * One-time "create your account" link for an e-mail that has no account yet.
 *
 * The existing token table (mcvv_email_token) needs a user id, which does not exist yet,
 * so the link carries a stateless payload sealed with AES-256-GCM instead (no migration):
 * - authentic and private: the GCM tag rejects any change and the e-mail is not readable
 *   from the URL (browser history, logs),
 * - time-limited: the payload holds an expiry checked on every use,
 * - single-use: consuming it creates the account and a link for an e-mail that already has
 *   an account is rejected (the unique e-mail column guards concurrent use),
 * - only the mailbox owner gets it: it is only ever sent to the address it was issued for.
 */
export const SIGNUP_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const PURPOSE = "mcvv-signup-v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

type SignupPayload = { e: string; x: number };

export type SignupClaim = { email: string; expiresAt: number };

function key(secret: string): Buffer {
  return createHash("sha256").update(`${PURPOSE}|${secret}`).digest();
}

export function createSignupToken(
  email: string,
  secret: string,
  now = Date.now(),
  ttlMs = SIGNUP_TOKEN_TTL_MS,
): string {
  const payload: SignupPayload = { e: email.trim().toLowerCase(), x: now + ttlMs };
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(PURPOSE));
  const sealed = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([iv, sealed, cipher.getAuthTag()]).toString("base64url");
}

export function isSignupTokenShape(token: unknown): token is string {
  return typeof token === "string" && token.length <= 700 && /^[A-Za-z0-9_-]{40,}$/.test(token);
}

/** Returns the e-mail the link was issued for, or null when forged, malformed or expired. */
export function readSignupToken(
  token: unknown,
  secret: string,
  now = Date.now(),
): SignupClaim | null {
  if (!isSignupTokenShape(token)) {
    return null;
  }
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length <= IV_BYTES + TAG_BYTES) {
      return null;
    }
    const decipher = createDecipheriv("aes-256-gcm", key(secret), raw.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(PURPOSE));
    decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES));
    const plain = Buffer.concat([
      decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(plain) as SignupPayload;
    if (
      typeof payload.e !== "string" ||
      !payload.e.includes("@") ||
      typeof payload.x !== "number" ||
      payload.x < now
    ) {
      return null;
    }
    return { email: payload.e, expiresAt: payload.x };
  } catch {
    return null;
  }
}
