import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Šifrování tajných nastavení v `mcvv_setting` (heslo akce OFeed). AES-256-GCM, klíč
 * odvozený HKDF ze `SESSION_SECRET`. Po změně SESSION_SECRET je potřeba heslo zadat znovu.
 */
const VERSION = "v1";

function deriveKey(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "mcvv-settings", purpose, 32));
}

export function sealSecret(plain: string, secret: string, purpose: string): string {
  if (secret.length < 32) throw new Error("secret too short");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, purpose), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, body]).toString("base64url")}`;
}

export function openSecret(sealed: string, secret: string, purpose: string): string | null {
  if (!sealed.startsWith(`${VERSION}:`) || secret.length < 32) return null;
  try {
    const raw = Buffer.from(sealed.slice(VERSION.length + 1), "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const body = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, purpose), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
