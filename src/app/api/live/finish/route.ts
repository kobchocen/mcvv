import { NextResponse, type NextRequest } from "next/server";

import { can, getAccess } from "@/lib/admin/access";
import { getSession } from "@/lib/auth/session";
import { applyFinishOps } from "@/lib/live/finish";
import { finishBatchSchema } from "@/lib/live/finish-core";
import { sameOrigin } from "@/lib/live/ingest-core";
import { getRaceContext } from "@/lib/live/race-context";
import { RateLimiter } from "@/lib/live/rate-limit";

export const dynamic = "force-dynamic";

const limiter = new RateLimiter(120, 4);
const noStore = { "Cache-Control": "no-store" };

/**
 * Dávka zápisů ze stanic v cíli (#252): kliky stopek a opsaná čísla z offline fronty.
 * Session cookie + oprávnění `screens.finish`, idempotentní podle `id` zápisu. Po dávce se
 * přepočítá párování a cílové časy v `mcvv_split` (online výsledky, tabule, speaker).
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
  const access = await getAccess();
  if (!can(access, "screens.finish", "write")) {
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
  const parsed = finishBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.issues.length },
      { status: 422, headers: noStore },
    );
  }
  try {
    const ctx = await getRaceContext();
    const results = await applyFinishOps(parsed.data.ops, ctx, session);
    return NextResponse.json(
      { ok: true, year: ctx.year, results, now: Date.now() },
      { headers: noStore },
    );
  } catch (error) {
    console.error("[live/finish] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server" }, { status: 500, headers: noStore });
  }
}
