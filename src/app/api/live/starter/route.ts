import { createHash } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { sameOrigin } from "@/lib/live/ingest-core";
import { getRaceContext } from "@/lib/live/race-context";
import { RateLimiter } from "@/lib/live/rate-limit";
import { applyStarterEntries, getStartCorridor, loadStarterSnapshot } from "@/lib/live/starter";
import { starterAccess, starterBatchSchema } from "@/lib/live/starter-api-core";

export const dynamic = "force-dynamic";

const postLimiter = new RateLimiter(60, 2);
const getLimiter = new RateLimiter(120, 4);
const noStore = { "Cache-Control": "no-store" };

async function access(requested: unknown) {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore }),
    };
  }
  const result = starterAccess(session.role, await getStartCorridor(session.id), requested);
  if (!result.ok) {
    return {
      error: NextResponse.json(
        { error: result.error },
        { status: result.error === "forbidden" ? 403 : 409, headers: noStore },
      ),
    };
  }
  return { session, access: result };
}

/**
 * Startovka koridoru + aktuální záznamy startu pro obrazovku startéra (`/start`). Klient ji
 * stahuje po otevření a pak každých pár sekund (ETag → 304, když se nic nezměnilo).
 */
export async function GET(request: NextRequest) {
  const auth = await access(request.nextUrl.searchParams.get("corridor"));
  if ("error" in auth) return auth.error;
  if (!getLimiter.take(`u${auth.session.id}`)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429, headers: noStore });
  }
  try {
    const ctx = await getRaceContext();
    const snapshot = await loadStarterSnapshot(ctx, auth.access.corridor);
    const body = JSON.stringify({ ...snapshot, canSwitch: auth.access.canSwitch });
    const etag = `"${createHash("sha1").update(body).digest("base64url")}"`;
    const headers = { ...noStore, ETag: etag, "X-Server-Now": String(Date.now()) };
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers });
    }
    return new NextResponse(body, {
      headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    console.error("[live/starter] snapshot failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server" }, { status: 500, headers: noStore });
  }
}

/**
 * Dávka ťuknutí ze zařízení startéra: `{ entries: [{ id, bib, action, at }] }`, akce
 * mark | unmark | ontime | late. Idempotentní podle `id` (offline fronta posílá totéž znovu),
 * startér jen čísla svého koridoru. Odpověď nese výsledek každé položky ve stejném pořadí.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (
    !sameOrigin(origin, request.headers.get("host")) &&
    !sameOrigin(origin, request.headers.get("x-forwarded-host"))
  ) {
    return NextResponse.json({ error: "origin" }, { status: 403, headers: noStore });
  }
  const auth = await access(request.nextUrl.searchParams.get("corridor"));
  if ("error" in auth) return auth.error;
  if (!postLimiter.take(`u${auth.session.id}`)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429, headers: noStore });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: noStore });
  }
  const parsed = starterBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues.length },
      { status: 422, headers: noStore },
    );
  }
  try {
    const ctx = await getRaceContext();
    const results = await applyStarterEntries(
      parsed.data.entries,
      ctx,
      auth.session,
      auth.access.allowed,
    );
    return NextResponse.json(
      { ok: true, year: ctx.year, results, now: Date.now() },
      { headers: noStore },
    );
  } catch (error) {
    console.error("[live/starter] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server" }, { status: 500, headers: noStore });
  }
}
