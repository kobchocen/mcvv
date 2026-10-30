/**
 * Lightweight per-IP rate limit for public runner profiles /cs|en/bezec/* (#199).
 *
 * In memory per app instance (fixed one-minute window), so it is only a backstop against a
 * single aggressive crawler; the real limit belongs to Cloudflare (see the PR of #199).
 * The default is generous (120 profiles / min / IP) so that people behind one NAT or mobile
 * CGNAT on race day are not affected; `BEZEC_RATE_LIMIT=0` turns it off.
 */
export const DEFAULT_BEZEC_RATE_LIMIT = 120;
const WINDOW_MS = 60_000;
const MAX_TRACKED_IPS = 10_000;

export type RateLimitDecision = { limited: false } | { limited: true; retryAfterSeconds: number };

export type RateLimiter = {
  hit(key: string, now?: number): RateLimitDecision;
  /** Forget the key's window (e.g. a successful login clears its failed attempts). */
  reset(key: string): void;
};

export function createRateLimiter(options: {
  limit: number;
  windowMs?: number;
  maxKeys?: number;
}): RateLimiter {
  const windowMs = options.windowMs ?? WINDOW_MS;
  const maxKeys = options.maxKeys ?? MAX_TRACKED_IPS;
  const windows = new Map<string, { start: number; count: number }>();
  const prune = (now: number) => {
    for (const [key, window] of windows) {
      if (now - window.start >= windowMs) windows.delete(key);
    }
    // Still too many distinct IPs within one window: forget them (fail open, bounded memory).
    if (windows.size >= maxKeys) windows.clear();
  };
  return {
    hit(key, now = Date.now()) {
      if (options.limit <= 0) return { limited: false };
      let window = windows.get(key);
      if (!window || now - window.start >= windowMs) {
        if (!window && windows.size >= maxKeys) prune(now);
        window = { start: now, count: 0 };
        windows.set(key, window);
      }
      window.count += 1;
      if (window.count <= options.limit) return { limited: false };
      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((window.start + windowMs - now) / 1000)),
      };
    },
    reset(key) {
      windows.delete(key);
    },
  };
}

/** Requests per minute per IP from BEZEC_RATE_LIMIT ("0" = off), default 120. */
export function bezecRateLimit(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_BEZEC_RATE_LIMIT;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_BEZEC_RATE_LIMIT;
}

const BEZEC_PATH = /^\/(cs|en)\/bezec(\/|$)/;

/** Locale-prefixed runner profile path (the proxy only rate-limits these and passes them on). */
export function isBezecPath(pathname: string): boolean {
  return BEZEC_PATH.test(pathname);
}

/**
 * Client IP for a runner-profile page view that counts against the limit, or null when the
 * request is not limited: other paths, non-GET, requests a browser makes with fetch()
 * (`Sec-Fetch-Dest` other than "document" – Next.js link prefetches and client-side
 * navigations; a results page prefetches hundreds of profile links, and Next.js strips the
 * RSC/prefetch headers before the proxy sees them) or no client IP header (never lump users
 * together). Crawlers load documents, which count. The IP comes from `clientIp`.
 */
export function bezecRateLimitKey(request: {
  pathname: string;
  method: string;
  headers: { get(name: string): string | null };
}): string | null {
  if (!isBezecPath(request.pathname)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const dest = request.headers.get("sec-fetch-dest");
  if (dest && dest !== "document") return null;
  if (request.headers.get("next-router-prefetch") || request.headers.get("purpose") === "prefetch")
    return null;
  return clientIp(request.headers);
}

/**
 * Client IP from proxy headers, or null when there is none (never lump users together).
 *
 * The app sits directly behind Azure Container Apps ingress (Cloudflare only serves DNS,
 * `proxied = false`), which appends the address it saw to X-Forwarded-For: only the
 * rightmost hop comes from the ingress, anything to the left is whatever the client sent
 * (https://learn.microsoft.com/azure/container-apps/ingress-overview#http-headers). Taking
 * the first hop, or `cf-connecting-ip` that no proxy sets, let one client pick its own
 * rate-limit key (bypass, or flood the key map until it is cleared). `cf-connecting-ip` is
 * trusted only with `trustCloudflare` (TRUST_CF_CONNECTING_IP=true, once the Cloudflare
 * proxy is on and the origin accepts traffic only from Cloudflare).
 */
export function clientIp(
  headers: { get(name: string): string | null },
  options: { trustCloudflare?: boolean } = {},
): string | null {
  const trustCloudflare = options.trustCloudflare ?? process.env.TRUST_CF_CONNECTING_IP === "true";
  if (trustCloudflare) {
    const cf = headers.get("cf-connecting-ip")?.trim();
    if (cf) return cf;
  }
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  const ip = hops.at(-1) || headers.get("x-real-ip")?.trim();
  return ip || null;
}

/**
 * Public online results /api/live/results: requests per minute per IP and replica from
 * LIVE_RESULTS_RATE_LIMIT ("0" = off), default 12000. A visible tab polls every 5 s
 * (12 / min), so the default lets ~1000 tabs through one NAT / mobile CGNAT address; the
 * answer comes from the in-memory snapshot (mostly 304), so this only stops a runaway client.
 */
export const DEFAULT_LIVE_RESULTS_RATE_LIMIT = 12_000;

export function liveResultsRateLimit(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_LIVE_RESULTS_RATE_LIMIT;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_LIVE_RESULTS_RATE_LIMIT;
}
