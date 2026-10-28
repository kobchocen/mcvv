import { createHash } from "node:crypto";

/**
 * Krátká in-memory cache odpovědi obrazovky speakera (#188). Všechny obrazovky (a záložky)
 * na jedné replice sdílejí jeden snímek: DB se dotazuje nejvýš jednou za `ttlMs` bez ohledu
 * na počet obrazovek; souběžné požadavky během načítání čekají na stejný slib.
 */
export type CachedBody = { body: string; etag: string; builtAt: number };

export function etagFor(body: string): string {
  return `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 22)}"`;
}

/** If-None-Match obsahuje náš ETag (seznam, `*`, slabé i silné porovnání). */
export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  const bare = (value: string) => value.trim().replace(/^W\//, "");
  return header.split(",").some((part) => part.trim() === "*" || bare(part) === bare(etag));
}

export function createBodyCache(
  load: () => Promise<unknown>,
  ttlMs: number,
  clock: () => number = Date.now,
) {
  let current: CachedBody | null = null;
  let inflight: Promise<CachedBody> | null = null;
  return {
    async get(): Promise<CachedBody> {
      if (current && clock() - current.builtAt < ttlMs) return current;
      if (!inflight) {
        inflight = (async () => {
          try {
            const body = JSON.stringify(await load());
            // stejná data → stejný ETag (klient dostane 304)
            current = { body, etag: etagFor(body), builtAt: clock() };
            return current;
          } finally {
            inflight = null;
          }
        })();
      }
      return inflight;
    },
    clear() {
      current = null;
    },
  };
}
