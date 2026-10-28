import type { NextRequest } from "next/server";

import { canViewSpeakerScreen } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { NO_STORE } from "@/lib/http/no-store";
import { speakerCache } from "@/lib/live/speaker";
import { etagMatches } from "@/lib/live/speaker-cache";

export const dynamic = "force-dynamic";

/**
 * Data obrazovky speakera (#188): klient se ptá každých 5 s s `If-None-Match`; beze změny
 * odpoví 304 bez těla. Snímek je sdílený v paměti repliky (`SPEAKER_CACHE_MS`), takže DB
 * nezatíží počet obrazovek. Jen admin nebo pořadatel (Q73).
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401, headers: NO_STORE });
  if (!canViewSpeakerScreen(session.role)) {
    return new Response("Forbidden", { status: 403, headers: NO_STORE });
  }
  const cached = await speakerCache.get();
  const headers = {
    ETag: cached.etag,
    // prohlížeč smí odpověď uložit, ale vždy ji musí ověřit (jen pro přihlášeného)
    "Cache-Control": "private, no-cache",
    Vary: "Cookie",
  };
  if (etagMatches(request.headers.get("if-none-match"), cached.etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(cached.body, {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
