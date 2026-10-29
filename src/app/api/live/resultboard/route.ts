import type { NextRequest } from "next/server";

import { RESULTBOARD_INFO_CACHE_CONTROL, resultboardInfoCache } from "@/lib/live/resultboard";
import { etagMatches } from "@/lib/live/speaker-cache";

export const dynamic = "force-dynamic";

/**
 * Nastavení resultboardu a partneři pro obrazovky v cíli (a přepínač upozornění speakera).
 * Veřejné (Q134), sdílená cache 30 s na replice, ETag → 304. Výsledky samotné jdou
 * z `/api/live/results` – resultboard nepřidává žádné dotazy do DB na diváka.
 */
export async function GET(request: NextRequest) {
  const cached = await resultboardInfoCache.get();
  const headers = {
    ETag: cached.etag,
    "Cache-Control": RESULTBOARD_INFO_CACHE_CONTROL,
    "X-Robots-Tag": "noindex",
  };
  if (etagMatches(request.headers.get("if-none-match"), cached.etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(cached.body, {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
