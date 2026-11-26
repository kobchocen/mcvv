import type { NextRequest } from "next/server";

import { canAccess } from "@/lib/admin/access";
import { getSession } from "@/lib/auth/session";
import { NO_STORE } from "@/lib/http/no-store";
import { RESULTBOARD_INFO_CACHE_CONTROL, resultboardInfoCache } from "@/lib/live/resultboard";
import { resultboardApiReject } from "@/lib/live/resultboard-access";
import { etagMatches } from "@/lib/live/speaker-cache";

export const dynamic = "force-dynamic";

/**
 * Nastavení resultboardu a partneři pro obrazovky v cíli (a přepínač upozornění speakera).
 * Jen přihlášení s `screens.resultboard` nebo `screens.speaker` (data bere i speaker).
 * Sdílená cache 30 s na replice, ETag → 304. Výsledky samotné jdou z `/api/live/results`,
 * které zůstává veřejné pro `/vysledky/online`.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  const rejected = resultboardApiReject(
    session !== null,
    session !== null &&
      ((await canAccess("screens.resultboard", "read")) ||
        (await canAccess("screens.speaker", "read"))),
  );
  if (rejected === 401) return new Response("Unauthorized", { status: 401, headers: NO_STORE });
  if (rejected === 403) return new Response("Forbidden", { status: 403, headers: NO_STORE });
  const cached = await resultboardInfoCache.get();
  const headers = {
    ETag: cached.etag,
    "Cache-Control": RESULTBOARD_INFO_CACHE_CONTROL,
    Vary: "Cookie",
    "X-Robots-Tag": "noindex",
  };
  if (etagMatches(request.headers.get("if-none-match"), cached.etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(cached.body, {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
