import { type NextRequest } from "next/server";

import { oauthLocale, startGoogle } from "@/lib/auth/oauth";
import { safeAdminNext } from "@/lib/auth/login-next";

export async function GET(request: NextRequest) {
  const locale = oauthLocale(request.nextUrl.searchParams.get("locale"));
  const next = safeAdminNext(request.nextUrl.searchParams.get("next"));
  return startGoogle(locale, next);
}
