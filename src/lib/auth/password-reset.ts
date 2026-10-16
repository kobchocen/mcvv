export const PASSWORD_MIN_LENGTH = 8;
export const BCRYPT_COST = 12;

export type PasswordProblem = "short" | "mismatch";

/** Same rules as registration: at least 8 characters and matching confirmation. */
export function checkNewPassword(password: string, confirm: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return "short";
  }
  if (password !== confirm) {
    return "mismatch";
  }
  return null;
}

export function isResetTokenUsable(
  row: { purpose: string; expiresAt: Date } | null | undefined,
  now = Date.now(),
): boolean {
  return Boolean(row && row.purpose === "reset" && row.expiresAt.getTime() >= now);
}

/** Fixed-window in-memory rate limiter (per process; good enough for one replica). */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true when the call is allowed (and counts it). */
  take(key: string, now = Date.now()): boolean {
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) {
        if (v.resetAt <= now) this.hits.delete(k);
      }
    }
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.limit) {
      return false;
    }
    entry.count += 1;
    return true;
  }
}
