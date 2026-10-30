import { createRateLimiter } from "@/lib/security/rate-limit";

/**
 * Rate limit for password login (#246), in memory per app instance like the other limiters.
 *
 * Every attempt counts against the client IP (LOGIN_RATE_LIMIT_IP, default 10 / 15 min) and the
 * normalized e-mail (LOGIN_RATE_LIMIT_EMAIL, default 5 / 15 min). The count happens before the
 * password check, so parallel requests cannot slip past it; a successful login clears the
 * e-mail counter, so effectively only failed attempts add up there. "0" turns a limit off.
 * Without a client IP only the e-mail limit applies (never lump users together).
 */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const DEFAULT_LOGIN_IP_LIMIT = 10;
export const DEFAULT_LOGIN_EMAIL_LIMIT = 5;

/** Attempts per window from an env value ("0" = off); invalid or empty means the default. */
export function loginRateLimit(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export type LoginGuard = {
  /** Counts one attempt; false = limited, answer with the generic "too many attempts". */
  attempt(ip: string | null, email: string, now?: number): boolean;
  /** Successful login: forget the e-mail's failed attempts. */
  succeeded(email: string): void;
};

export function createLoginGuard(options: {
  ipLimit: number;
  emailLimit: number;
  windowMs?: number;
}): LoginGuard {
  const windowMs = options.windowMs ?? LOGIN_WINDOW_MS;
  const perIp = createRateLimiter({ limit: options.ipLimit, windowMs });
  const perEmail = createRateLimiter({ limit: options.emailLimit, windowMs });
  return {
    attempt(ip, email, now = Date.now()) {
      if (ip && perIp.hit(ip, now).limited) return false;
      return !perEmail.hit(email, now).limited;
    },
    succeeded(email) {
      perEmail.reset(email);
    },
  };
}
