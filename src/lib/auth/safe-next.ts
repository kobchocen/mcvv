/**
 * Sanitizer for the post-login `next` parameter (pure, no framework imports).
 *
 * Only same-origin, relative, known paths are accepted, which prevents open redirects:
 * - admin paths (`/admin/...`) – honoured only for staff in `redirectAfterLogin`,
 * - an allowlist of public pages (e.g. `/prihlasky`, `/navod`).
 * The locale prefix (`/cs`, `/en`) is stripped; the result is a locale-less path.
 */
export const ADMIN_PATH = /^\/admin(?:\/[\w.-]+)*$/;
const SAFE_QUERY = /^[\w.=&-]*$/;

export const USER_NEXT_PATHS = [
  "/",
  "/prihlasky",
  "/navod",
  "/program",
  "/pokyny",
  "/startovka",
  "/prihlaseni-zavodnici",
  "/kontakt",
  "/results",
  "/fotogalerie",
  "/statistiky",
] as const;
export type UserNextPath = (typeof USER_NEXT_PATHS)[number];

export function stripLocale(pathname: string): string {
  const match = pathname.match(/^\/(cs|en)(?=\/|$|\?)/);
  if (!match) {
    return pathname || "/";
  }
  const stripped = pathname.slice(match[0].length);
  return stripped.startsWith("/") || stripped.startsWith("?") ? stripped || "/" : `/${stripped}`;
}

function normalize(raw: unknown): { path: string; query: string } | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 180) {
    return null;
  }
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  // Must be a root-relative path; no scheme, protocol-relative, backslash or control chars.
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f@]/.test(value)) {
    return null;
  }
  if (value.includes("://")) {
    return null;
  }
  value = stripLocale(value);
  const qIndex = value.indexOf("?");
  const path = (qIndex >= 0 ? value.slice(0, qIndex) : value).replace(/\/$/, "") || "/";
  const query = qIndex >= 0 ? value.slice(qIndex + 1) : "";
  if (path.includes("//") || path.includes("..")) {
    return null;
  }
  if (query && !SAFE_QUERY.test(query)) {
    return null;
  }
  return { path, query };
}

/** Admin-only variant (kept for backwards compatibility). */
export function safeAdminNext(raw: unknown): string | null {
  const parsed = normalize(raw);
  if (!parsed || !ADMIN_PATH.test(parsed.path)) {
    return null;
  }
  return parsed.query ? `${parsed.path}?${parsed.query}` : parsed.path;
}

/** Accepts admin paths and allowlisted public paths; returns `path[?query]` or null. */
export function safeNext(raw: unknown): string | null {
  const parsed = normalize(raw);
  if (!parsed) {
    return null;
  }
  const allowed =
    ADMIN_PATH.test(parsed.path) || (USER_NEXT_PATHS as readonly string[]).includes(parsed.path);
  if (!allowed) {
    return null;
  }
  return parsed.query ? `${parsed.path}?${parsed.query}` : parsed.path;
}

export function isAdminNext(next: string): boolean {
  const path = next.split("?")[0] ?? "";
  return ADMIN_PATH.test(path);
}

export type LoginTarget =
  | { kind: "admin"; next: string }
  | { kind: "user"; path: UserNextPath; query: string }
  | { kind: "default" };

/** Decides where to go after a successful login. Default is the application page. */
export function loginTarget(next: string | null, staff: boolean): LoginTarget {
  if (next) {
    if (isAdminNext(next)) {
      if (staff) {
        return { kind: "admin", next };
      }
    } else {
      const [path = "", query = ""] = next.split("?");
      if ((USER_NEXT_PATHS as readonly string[]).includes(path) && path !== "/") {
        return { kind: "user", path: path as UserNextPath, query };
      }
    }
  }
  return { kind: "default" };
}
