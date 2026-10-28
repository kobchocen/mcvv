import { NextResponse, type NextRequest } from "next/server";

import { getSession } from "@/lib/auth/session";
import { allowedStationsFor } from "@/lib/live/assignment-core";
import { getAssignedStations } from "@/lib/live/assignment";
import { applyWebEntries, rejectWebEntries, type EntryResult } from "@/lib/live/ingest";
import { sameOrigin, summarize, webBatchSchema } from "@/lib/live/ingest-core";
import { getRaceContext, getStations } from "@/lib/live/race-context";
import { RateLimiter } from "@/lib/live/rate-limit";
import { applyStartEntries, rejectStartEntries } from "@/lib/live/start-check";
import { partitionStartEntries } from "@/lib/live/start-check-core";
import { withStart } from "@/lib/live/stations";
import { canAccessSplits } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

const limiter = new RateLimiter(60, 2);
const noStore = { "Cache-Control": "no-store" };

/**
 * Dávka zápisů z webového klienta splitmakera (#121). Session cookie + kontrola role na serveru,
 * idempotentní podle `id` zápisu (offline fronta může poslat totéž víckrát).
 * Zápisy ze stanoviště Start (kód "0", #203) jdou jen do evidence startu, nikdy do mcvv_split.
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
  if (!session || !canAccessSplits(session.role)) {
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
  const [splitStations, assigned] = await Promise.all([
    getStations(),
    getAssignedStations(session.id),
  ]);
  const stations = withStart(splitStations);
  const known = new Set(stations.map((station) => station.code));
  if (parsed.data.entries.some((entry) => !known.has(entry.split))) {
    return NextResponse.json({ error: "station" }, { status: 422, headers: noStore });
  }
  // Splitmaker smí jen na přiřazená stanoviště; admin a organizer na všechna.
  const allowed = new Set(
    allowedStationsFor(session.role, assigned, stations).map((station) => station.code),
  );
  try {
    const ctx = await getRaceContext();
    const { start, splits } = partitionStartEntries(parsed.data.entries);
    const permitted = splits.filter((entry) => allowed.has(entry.split));
    const refused = splits.filter((entry) => !allowed.has(entry.split));
    const startPermitted = start.filter((entry) => allowed.has(entry.split));
    const startRefused = start.filter((entry) => !allowed.has(entry.split));
    const byId = new Map<string, EntryResult>();
    for (const result of await applyWebEntries(permitted, ctx, session)) {
      byId.set(result.id, result);
    }
    for (const result of await rejectWebEntries(refused, ctx, session, "station-not-assigned")) {
      byId.set(result.id, result);
    }
    for (const result of await applyStartEntries(startPermitted, ctx, session)) {
      byId.set(result.id, result);
    }
    for (const result of await rejectStartEntries(
      startRefused,
      ctx,
      session,
      "station-not-assigned",
    )) {
      byId.set(result.id, result);
    }
    const results = parsed.data.entries.map((entry) => byId.get(entry.id)!);
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
