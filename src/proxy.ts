import { NextResponse, type NextRequest } from "next/server";

import { localeRedirectTarget } from "./i18n/locale-redirect";
import { adminGate, REQUEST_PATH_HEADER } from "./lib/auth/admin-gate";
import { decodeSessionToken, SESSION_COOKIE, usableSessionSecret } from "./lib/auth/session-token";
import { env } from "./lib/env";
import {
  decodeViewAs,
  VIEW_AS_BLOCKED_BODY,
  regularProxyPath,
  VIEW_AS_COOKIE,
  viewAsBlocks,
} from "./lib/admin/view-as-core";
import {
  bezecRateLimit,
  bezecRateLimitKey,
  createRateLimiter,
  isBezecPath,
} from "./lib/security/rate-limit";

const bezecLimiter = createRateLimiter({ limit: bezecRateLimit(env.BEZEC_RATE_LIMIT) });

// Note: with the `src/` layout Next.js only picks up `src/proxy.ts`; the former root-level
// `proxy.ts` (next-intl middleware) was never executed. Locale routing is handled by the
// `[locale]` segment and `src/app/page.tsx`, so this proxy
// - redirects page paths that are missing the locale prefix (e.g. /registrace -> /cs/registrace),
//   keeping the query,
// - guards admin pages: without a valid session cookie of an admin-capable role it answers
//   with a real 307 to /{locale}/prihlaseni?next=<original path> (pages still verify the
//   role against the DB via requireStaff & co.),
// - rate-limits runner profiles /{locale}/bezec/* per client IP (#199, BEZEC_RATE_LIMIT),
// - while an admin previews the admin as another role (signed `mcvv_view_as` cookie) blocks
//   every write (server actions, POST/PUT/PATCH/DELETE on pages and API) except the
//   view-as route itself. Only then the proxy also runs for paths it normally skips.
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const viewAs = request.cookies.get(VIEW_AS_COOKIE)?.value;
  if (viewAs) {
    if (viewAsBlocks(request.method, pathname)) {
      const secret = usableSessionSecret(env.SESSION_SECRET);
      if (secret && decodeViewAs(viewAs, secret)) {
        return new NextResponse(VIEW_AS_BLOCKED_BODY, {
          status: 403,
          headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    }
    if (!regularProxyPath(pathname)) {
      return NextResponse.next();
    }
  }

  if (isBezecPath(pathname)) {
    const key = bezecRateLimitKey({ pathname, method: request.method, headers: request.headers });
    const decision = key ? bezecLimiter.hit(key) : null;
    if (decision?.limited) {
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: {
          "Retry-After": String(decision.retryAfterSeconds),
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }
    return NextResponse.next();
  }

  const cookie = sessionCookie(request);
  const gate = adminGate({
    pathname,
    search,
    method: request.method,
    isRscOrAction: request.headers.has("rsc") || request.headers.has("next-action"),
    cookieRole: cookie?.role ?? null,
    cookieStaff: cookie?.staff === true,
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

function sessionCookie(request: NextRequest) {
  const secret = usableSessionSecret(env.SESSION_SECRET);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!secret || !token) {
    return null;
  }
  return decodeSessionToken(token, secret);
}

export const config = {
  // Keep the locale list in sync with next-intl.config.ts (proxy.test.ts checks it).
  // Everything except locale-prefixed pages, API/internal routes and static files,
  // plus the locale-prefixed admin pages (login guard) and runner profiles (rate limit).
  matcher: [
    "/((?!cs/|cs$|en/|en$|de/|de$|pl/|pl$|uk/|uk$|api|_next|_vercel|healthz|readyz|test|.*\\..*).*)",
    "/(cs|en|de|pl|uk)/admin/:path*",
    "/(cs|en|de|pl|uk)/bezec/:path*",
    // Náhled role (mcvv_view_as): proxy blokuje zápisy na všech cestách, jen když cookie je.
    { source: "/:path*", has: [{ type: "cookie", key: "mcvv_view_as" }] },
  ],
};
