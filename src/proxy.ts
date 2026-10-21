import { NextResponse, type NextRequest } from "next/server";

import { localeRedirectTarget } from "./i18n/locale-redirect";
import { adminGate, REQUEST_PATH_HEADER } from "./lib/auth/admin-gate";
import { decodeSessionToken, SESSION_COOKIE, usableSessionSecret } from "./lib/auth/session-token";
import { env } from "./lib/env";

// Note: with the `src/` layout Next.js only picks up `src/proxy.ts`; the former root-level
// `proxy.ts` (next-intl middleware) was never executed. Locale routing is handled by the
// `[locale]` segment and `src/app/page.tsx`, so this proxy
// - redirects page paths that are missing the locale prefix (e.g. /registrace -> /cs/registrace),
//   keeping the query,
// - guards admin pages: without a valid session cookie of an admin-capable role it answers
//   with a real 307 to /{locale}/prihlaseni?next=<original path> (pages still verify the
//   role against the DB via requireStaff & co.).
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const gate = adminGate({
    pathname,
    search,
    method: request.method,
    isRscOrAction: request.headers.has("rsc") || request.headers.has("next-action"),
    cookieRole: cookieRole(request),
  });
  if (gate.kind === "redirect") {
    const url = request.nextUrl.clone();
    const queryStart = gate.location.indexOf("?");
    url.pathname = queryStart === -1 ? gate.location : gate.location.slice(0, queryStart);
    url.search = queryStart === -1 ? "" : gate.location.slice(queryStart);
    return NextResponse.redirect(url, 307);
  }
  if (gate.kind === "pass") {
    const headers = new Headers(request.headers);
    headers.set(REQUEST_PATH_HEADER, gate.requestPath);
    return NextResponse.next({ request: { headers } });
  }

  const target = localeRedirectTarget(pathname, search);
  if (!target) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  const queryStart = target.indexOf("?");
  url.pathname = queryStart === -1 ? target : target.slice(0, queryStart);
  url.search = queryStart === -1 ? "" : target.slice(queryStart);
  return NextResponse.redirect(url, 308);
}

function cookieRole(request: NextRequest) {
  const secret = usableSessionSecret(env.SESSION_SECRET);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!secret || !token) {
    return null;
  }
  return decodeSessionToken(token, secret)?.role ?? null;
}

export const config = {
  // Everything except locale-prefixed pages, API/internal routes and static files,
  // plus the locale-prefixed admin pages (login guard).
  matcher: [
    "/((?!cs/|cs$|en/|en$|api|_next|_vercel|healthz|readyz|test|.*\\..*).*)",
    "/(cs|en)/admin/:path*",
  ],
};
