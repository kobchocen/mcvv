import type { NextRequest } from "next/server";

import { canViewSpeakerScreen } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { NO_STORE } from "@/lib/http/no-store";
import { resultboardTestCache } from "@/lib/live/resultboard";
import { etagMatches } from "@/lib/live/speaker-cache";

export const dynamic = "force-dynamic";

/**
 * Resultboard `?test=1` (Q135): stejný formát jako `/api/live/results`, ale včetně
 * testovacího běhu. Jen přihlášený pořadatel / admin; veřejnost test nevidí (Q117).
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401, headers: NO_STORE });
  if (!canViewSpeakerScreen(session.role)) {
    return new Response("Forbidden", { status: 403, headers: NO_STORE });
  }
  const cached = await resultboardTestCache.get();
  const headers = { ETag: cached.etag, "Cache-Control": "private, no-cache", Vary: "Cookie" };
  if (etagMatches(request.headers.get("if-none-match"), cached.etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(cached.body, {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
