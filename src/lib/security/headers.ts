/**
 * Security response headers for every route (wired in next.config.ts).
 * Pure and dependency-free so next.config can import it and tests can check it.
 *
 * The Content-Security-Policy is shipped as **Report-Only**: the App Router injects
 * inline bootstrap scripts (no nonces without forcing dynamic rendering), the theme
 * script and SVG/newsletter previews use inline styles, so an enforced policy needs
 * a period of observing reports first. Only directives that cannot break the site
 * (frame-ancestors, base-uri, object-src) are enforced right away.
 */

export type HeaderEntry = { key: string; value: string };

/** External origins the browser talks to (keep in sync with the code). */
export const CSP_EXTERNAL = {
  /** jsPDF loads the DejaVu font for Czech diacritics (DownloadResultsButton). */
  connect: ["https://cdn.jsdelivr.net"],
  /** OAuth sign-in (redirect navigations; listed for form submissions that redirect). */
  formAction: ["https://accounts.google.com", "https://appleid.apple.com"],
} as const;

export const CSP_REPORT_PATH = "/api/csp-report";

type Directives = Record<string, string[]>;

function serialize(directives: Directives): string {
  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

/** Always-safe directives, enforced. */
export function enforcedCsp(): string {
  return serialize({
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  });
}

/** Full policy, report-only for now. */
export function reportOnlyCsp(options: { dev?: boolean } = {}): string {
  const script = ["'self'", "'unsafe-inline'"];
  const connect = ["'self'", ...CSP_EXTERNAL.connect];
  if (options.dev) {
    // React Refresh / HMR in `next dev`.
    script.push("'unsafe-eval'");
    connect.push("ws:");
  }
  return serialize({
    "default-src": ["'self'"],
    "script-src": script,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": connect,
    "frame-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "media-src": ["'self'"],
    "form-action": ["'self'", ...CSP_EXTERNAL.formAction],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "report-uri": [CSP_REPORT_PATH],
  });
}

export function securityHeaders(options: { dev?: boolean } = {}): HeaderEntry[] {
  return [
    // Same value as the Azure ingress sends today; no includeSubDomains/preload on purpose.
    { key: "Strict-Transport-Security", value: "max-age=31536000" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "payment=()",
        "usb=()",
        "serial=()",
        "bluetooth=()",
        "magnetometer=()",
        "gyroscope=()",
        "accelerometer=()",
        "browsing-topics=()",
      ].join(", "),
    },
    { key: "Content-Security-Policy", value: enforcedCsp() },
    { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp(options) },
  ];
}

export type CspViolation = {
  directive: string;
  blocked: string;
  document: string;
  source?: string;
};

const clip = (value: unknown, max = 300): string => String(value ?? "").slice(0, max);

/** Strip query/fragment so reports never log tokens from URLs. */
function stripUrl(value: unknown): string {
  const raw = clip(value, 2000);
  try {
    const url = new URL(raw);
    return clip(`${url.origin}${url.pathname}`);
  } catch {
    return clip(raw.split(/[?#]/)[0]);
  }
}

/**
 * Parse a CSP report body: legacy `report-uri` ({"csp-report": {...}}) or the
 * Reporting API array ([{type:"csp-violation", body:{...}}]). Max 20 entries.
 */
export function parseCspReport(payload: unknown): CspViolation[] {
  const bodies: Record<string, unknown>[] = [];
  if (Array.isArray(payload)) {
    for (const item of payload.slice(0, 20)) {
      if (
        item &&
        typeof item === "object" &&
        (item as { type?: unknown }).type === "csp-violation"
      ) {
        const body = (item as { body?: unknown }).body;
        if (body && typeof body === "object") bodies.push(body as Record<string, unknown>);
      }
    }
  } else if (payload && typeof payload === "object" && "csp-report" in payload) {
    const body = (payload as Record<string, unknown>)["csp-report"];
    if (body && typeof body === "object") bodies.push(body as Record<string, unknown>);
  }
  return bodies.map((b) => {
    const violation: CspViolation = {
      directive: clip(
        b["effective-directive"] ?? b.effectiveDirective ?? b["violated-directive"],
        80,
      ),
      blocked: stripUrl(b["blocked-uri"] ?? b.blockedURL),
      document: stripUrl(b["document-uri"] ?? b.documentURL),
    };
    const source = b["source-file"] ?? b.sourceFile;
    if (source) violation.source = stripUrl(source);
    return violation;
  });
}
