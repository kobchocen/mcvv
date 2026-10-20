import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { applyWebEntries } from "@/lib/live/ingest";
import { sameOrigin, summarize, webBatchSchema } from "@/lib/live/ingest-core";
import { getRaceContext, getStations } from "@/lib/live/race-context";
import { RateLimiter } from "@/lib/live/rate-limit";
import { canAccessSplits } from "@/lib/live/roles";

export const dynamic = "force-dynamic";

const limiter = new RateLimiter(60, 2);
const noStore = { "Cache-Control": "no-store" };

/**
 * Dávka zápisů z webového klienta splitmakera (#121). Session cookie + kontrola role na serveru,
 * idempotentní podle `id` zápisu (offline fronta může poslat totéž víckrát).
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (
    !sameOrigin(origin, request.headers.get("host")) &&
    !sameOrigin(origin, request.headers.get("x-forwarded-host"))
  ) {
    return NextResponse.json({ error: "origin" }, { status: 403, headers: noStore });
  }
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  if (!canAccessSplits(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: noStore });
  }
  if (!limiter.take(`u${session.id}`)) {
    return NextResponse.json({ error: "rate-limited" }, { status: 429, headers: noStore });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: noStore });
  }
  const parsed = webBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues.length },
      { status: 422, headers: noStore },
    );
  }
  const stations = await getStations();
  const allowed = new Set(stations.map((station) => station.code));
  if (parsed.data.entries.some((entry) => !allowed.has(entry.split))) {
    return NextResponse.json({ error: "station" }, { status: 422, headers: noStore });
  }
  try {
    const ctx = await getRaceContext();
    const results = await applyWebEntries(parsed.data.entries, ctx, session);
    return NextResponse.json(
      {
        ok: true,
        year: ctx.year,
        results,
        summary: summarize(results.map((r) => r.outcome)),
        now: Date.now(),
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("[live/splits] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server" }, { status: 500, headers: noStore });
  }
}
