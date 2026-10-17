import { NextResponse, type NextRequest } from "next/server";

import { localeRedirectTarget } from "./i18n/locale-redirect";

// Note: with the `src/` layout Next.js only picks up `src/proxy.ts`; the former root-level
// `proxy.ts` (next-intl middleware) was never executed. Locale routing is handled by the
// `[locale]` segment and `src/app/page.tsx`, so this proxy only redirects page paths that
// are missing the locale prefix (e.g. /registrace -> /cs/registrace), keeping the query.
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
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

export const config = {
  // Everything except locale-prefixed pages, API/internal routes and static files.
  matcher: ["/((?!cs/|cs$|en/|en$|api|_next|_vercel|healthz|readyz|test|.*\\..*).*)"],
};
