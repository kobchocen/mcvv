/** Interval dotazu na živá data (Q73: polling s ETag/304, bez SSE ani websocketu). */
export const LIVE_POLL_MS = 5000;
/** Strop backoffu po chybách (výpadek, 429, 5xx). */
export const LIVE_POLL_MAX_MS = 60_000;

/**
 * Za jak dlouho se zeptat znovu: 5 s, po chybách 10, 20, 40, 60 s (strop), u 429/503 nejméně
 * `Retry-After`. Náhodný rozptyl ±10 % (`random` 0–1) rozhází diváky, kteří načetli stránku
 * ve stejnou chvíli (start, obnova po výpadku), aby necílili na server ve stejné vteřině.
 */
export function nextPollDelay(
  failures: number,
  retryAfterS: number | null = null,
  random = 0.5,
): number {
  const base = Math.min(LIVE_POLL_MS * 2 ** Math.max(0, failures), LIVE_POLL_MAX_MS);
  const withRetry = retryAfterS && retryAfterS > 0 ? Math.max(base, retryAfterS * 1000) : base;
  return Math.round(withRetry * (0.9 + 0.2 * Math.min(1, Math.max(0, random))));
}

/** `Retry-After` v sekundách (jen číselná podoba; datum ignorujeme). */
export function parseRetryAfter(header: string | null): number | null {
  const value = Number((header ?? "").trim());
  return header && Number.isFinite(value) && value > 0 ? value : null;
}
