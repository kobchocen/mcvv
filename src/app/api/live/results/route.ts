import type { NextRequest } from "next/server";

import { NO_STORE } from "@/lib/http/no-store";
import { ONLINE_RESULTS_CACHE_CONTROL, onlineResultsCache } from "@/lib/live/online-results";
import { etagMatches } from "@/lib/live/speaker-cache";
import { clientIp, createRateLimiter } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Veřejný backstop proti jednomu agresivnímu klientovi (v paměti repliky, pevné okno 1 min).
 * Záložka se ptá nejvýš jednou za 5 s (12 / min), takže 3000 / min nechá projít ~250 diváků
 * za jednou NAT (Wi-Fi v cíli, CGNAT operátora). Odpověď jde z paměti, DB tím nezatíží.
 */
const limiter = createRateLimiter({ limit: 3000 });

/**
 * Data veřejných online výsledků (náhrada OFeed): stejný mechanismus jako speaker (#188) –
 * klient se ptá každých 5 s s `If-None-Match` a beze změny dostane 304 bez těla; snímek je
 * sdílený v paměti repliky (`ONLINE_RESULTS_CACHE_MS`). Bez přihlášení, jen čtení a jen
 * data pro zobrazení (číslo, jméno, kategorie, plánovaný start, časy, start potvrzen).
 */
export async function GET(request: NextRequest) {
  const ip = clientIp(request.headers);
  const decision = ip ? limiter.hit(ip) : null;
  if (decision?.limited) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { ...NO_STORE, "Retry-After": String(decision.retryAfterSeconds) },
    });
  }
  const cached = await onlineResultsCache.get();
  const headers = {
    ETag: cached.etag,
    // sdílené cache (CDN, proxy, prohlížeč) smí odpověď držet 5 s (= TTL snímku) a chvíli
    // ještě vydat starou, než ji na pozadí obnoví; ověření přes ETag → 304
    "Cache-Control": ONLINE_RESULTS_CACHE_CONTROL,
    "X-Robots-Tag": "noindex",
  };
  if (etagMatches(request.headers.get("if-none-match"), cached.etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(cached.body, {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
