import { createHash, randomBytes } from "node:crypto";

/**
 * API klíče zařízení (#120). Klíč se ukáže jen jednou při vytvoření, v DB je SHA-256.
 * Formát: `mcvv_live_<43 znaků base64url>` – prefix pomáhá najít klíč v logu nebo configu.
 */
export const TOKEN_PREFIX = "mcvv_live_";

export function generateToken(): { token: string; hash: string; prefix: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, TOKEN_PREFIX.length + 4) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function parseBearer(header: string | null): string | null {
  const match = /^Bearer\s+(\S{20,200})$/.exec(header ?? "");
  return match ? match[1] : null;
}

export type TokenWindow = {
  validFrom: Date;
  validUntil: Date;
  revokedAt: Date | null;
};

export type TokenState = "active" | "revoked" | "expired" | "not-yet-valid";

export function tokenState(token: TokenWindow, now: Date): TokenState {
  if (token.revokedAt) return "revoked";
  if (now < token.validFrom) return "not-yet-valid";
  if (now > token.validUntil) return "expired";
  return "active";
}

/** Povolené splity klíče, např. "9" nebo "139". */
export function tokenAllowsSplit(splits: string, split: string): boolean {
  return /^[1-9]$/.test(split) && splits.includes(split);
}

export function normalizeTokenSplits(raw: string): string | null {
  const unique = [...new Set(raw.replace(/[^1-9]/g, "").split(""))].sort().join("");
  return unique.length > 0 && unique.length <= 8 ? unique : null;
}

/** Autor pro mcvv_split.autor: max 8 znaků, jen bezpečné znaky. */
export function normalizeAuthor(raw: string): string | null {
  const value = raw.trim();
  return /^[A-Za-z0-9_-]{1,8}$/.test(value) ? value : null;
}
