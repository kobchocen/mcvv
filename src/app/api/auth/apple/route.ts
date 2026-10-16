import { type NextRequest } from "next/server";

import { oauthLocale, startApple } from "@/lib/auth/oauth";
import { safeAdminNext } from "@/lib/auth/login-next";

export async function GET(request: NextRequest) {
  const locale = oauthLocale(request.nextUrl.searchParams.get("locale"));
  const next = safeAdminNext(request.nextUrl.searchParams.get("next"));
  return startApple(locale, next);
}
