import { createHash, timingSafeEqual } from "node:crypto";

/** Ověří `Authorization: Bearer <CRON_SECRET>` (konstantní čas). Bez nastaveného secretu vždy false. */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 32 || !header) return false;
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  const left = createHash("sha256").update(match[1]).digest();
  const right = createHash("sha256").update(secret).digest();
  return timingSafeEqual(left, right);
}
