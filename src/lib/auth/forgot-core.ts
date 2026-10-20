import type { RateLimiter } from "@/lib/auth/password-reset";

/** What happened behind the scenes. Never shown to the visitor (no account enumeration). */
export type ForgotOutcome = "ignored" | "limited" | "reset" | "signup" | "failed";

export type ForgotDeps = {
  perIp: RateLimiter;
  perEmail: RateLimiter;
  findAccount(email: string): Promise<{ id: number; email: string } | null>;
  /** Existing account: the unchanged password-reset e-mail. */
  sendReset(account: { id: number; email: string }): Promise<unknown>;
  /** No account yet: one-time link to create it ("Účet u nás zatím nemáte"). */
  sendSignupInvite(email: string): Promise<unknown>;
  log?(message: string): void;
};

/** The one and only web answer to a forgot-password request. */
export const FORGOT_SENT: { sent: true } = Object.freeze({ sent: true as const });

/** Maps every outcome to the same answer, so the response never reveals who has an account. */
export function forgotAnswer(outcome: ForgotOutcome): { sent: true } {
  void outcome;
  return { ...FORGOT_SENT };
}

export function normalizeForgotEmail(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 255);
}

/**
 * Forgot-password request. Both branches share the same rate limits (per IP and per e-mail)
 * and the caller always answers the same way, whatever the outcome.
 */
export async function processForgotRequest(
  email: string,
  ip: string,
  deps: ForgotDeps,
): Promise<ForgotOutcome> {
  if (!email || !email.includes("@")) {
    return "ignored";
  }
  const ipAllowed = deps.perIp.take(ip);
  const emailAllowed = deps.perEmail.take(email);
  if (!ipAllowed || !emailAllowed) {
    return "limited";
  }
  try {
    const account = await deps.findAccount(email);
    if (account) {
      await deps.sendReset(account);
      return "reset";
    }
    await deps.sendSignupInvite(email);
    return "signup";
  } catch (error) {
    deps.log?.(error instanceof Error ? error.message : "");
    return "failed";
  }
}
