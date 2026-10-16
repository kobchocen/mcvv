import { NextResponse, type NextRequest } from "next/server";

import { appOrigin } from "@/lib/auth/tokens";
import { env } from "@/lib/env";
import { verifyEmailToken, verifyLocale } from "@/lib/auth/verify-email";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const locale = verifyLocale(params.get("locale"));
  const result = await verifyEmailToken(params.get("token"));
  const origin = env.AUTH_ORIGIN?.replace(/\/$/, "") || (await appOrigin());
  const target =
    result === "ok" ? `/${locale}/prihlasky?overeno=1` : `/${locale}/prihlaseni?overeni=neplatne`;
  const response = NextResponse.redirect(new URL(target, origin), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
