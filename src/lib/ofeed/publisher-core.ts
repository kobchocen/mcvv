import { createHash } from "node:crypto";

import { contentFingerprintSource } from "./iof-xml";

/** Interval publikace (Pavel: ~30 s). Rate limit OFeed v kódu: 200 req / 15 min / IP. */
export const PUBLISH_INTERVAL_MS = 30_000;
/** I beze změny dat jednou za 10 min upload zopakovat (kdyby OFeed data ztratil). */
export const REFRESH_UNCHANGED_MS = 10 * 60_000;
/** Lease jednoho zapisovatele mezi replikami (delší než interval i timeout uploadu). */
export const LEASE_TTL_MS = 45_000;
export const UPLOAD_TIMEOUT_MS = 20_000;
/** Okno automatické publikace kolem nuly závodu. */
export const WINDOW_BEFORE_MS = 2 * 3600_000;
export const WINDOW_AFTER_MS = 5 * 3600_000;

export function isWithinLiveWindow(now: Date, zero: Date): boolean {
  const t = now.getTime();
  return t >= zero.getTime() - WINDOW_BEFORE_MS && t <= zero.getTime() + WINDOW_AFTER_MS;
}

export function fingerprint(xml: string): string {
  return createHash("sha256").update(contentFingerprintSource(xml), "utf8").digest("hex");
}

export function shouldUpload(input: {
  hash: string;
  lastHash: string | null;
  lastOkAt: Date | null;
  now: Date;
  force: boolean;
}): boolean {
  if (input.force) return true;
  if (input.hash !== input.lastHash) return true;
  return !input.lastOkAt || input.now.getTime() - input.lastOkAt.getTime() >= REFRESH_UNCHANGED_MS;
}

/** Chybová hláška do adminu / DB: bez tajemství, jeden řádek, max 500 znaků. */
export function sanitizeError(message: string, secrets: (string | null | undefined)[]): string {
  let out = message;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join("***");
  }
  return out
    .replace(/Basic\s+[A-Za-z0-9+/=]+/g, "Basic ***")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}
