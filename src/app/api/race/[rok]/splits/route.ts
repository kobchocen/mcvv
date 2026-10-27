import { NextResponse, type NextRequest } from "next/server";

import { applyDeviceItems } from "@/lib/live/ingest";
import { deviceBatchSchema, summarize } from "@/lib/live/ingest-core";
import { getRaceContext } from "@/lib/live/race-context";
import { RateLimiter } from "@/lib/live/rate-limit";
import { dataEpoch, getActiveTestRun } from "@/lib/live/test-run";
import { authenticateDevice } from "@/lib/live/tokens";
import { tokenAllowsSplit } from "@/lib/live/tokens-core";

export const dynamic = "force-dynamic";

const limiter = new RateLimiter(120, 4);
const noStore = { "Cache-Control": "no-store" };

type Params = { params: Promise<{ rok: string }> };

async function authorize(request: NextRequest, rok: string) {
  const year = Number(rok);
  if (!/^\d{4}$/.test(rok)) {
    return { error: NextResponse.json({ error: "year" }, { status: 404, headers: noStore }) };
  }
  const auth = await authenticateDevice(request.headers.get("authorization"));
  if (!auth.ok) {
    return {
      error: NextResponse.json(
        { error: "unauthorized", reason: auth.reason },
        { status: 401, headers: { ...noStore, "WWW-Authenticate": "Bearer" } },
      ),
    };
  }
  if (auth.token.year !== year) {
    return {
      error: NextResponse.json({ error: "year-mismatch" }, { status: 403, headers: noStore }),
    };
  }
  if (!limiter.take(`t${auth.token.id}`)) {
    return {
      error: NextResponse.json(
        { error: "rate-limited" },
        { status: 429, headers: { ...noStore, "Retry-After": "5" } },
      ),
    };
  }
  return { token: auth.token };
}

/**
 * Epocha dat pro obd-klient (#186, Q72): mění se s novým testovacím během i s novou nulou.
 * Klient při změně zahodí svůj state.json, takže na cílovém PC není potřeba nic mazat.
 */
async function epochInfo() {
  const [run, ctx] = await Promise.all([getActiveTestRun(), getRaceContext()]);
  return { epoch: dataEpoch(run, ctx.zero), test: run !== null };
}

/** Kontrola spojení a klíče z klienta na cílovém PC (#120). */
export async function GET(request: NextRequest, { params }: Params) {
  const { rok } = await params;
  const auth = await authorize(request, rok);
  if ("error" in auth) return auth.error;
  return NextResponse.json(
    {
      ok: true,
      year: auth.token.year,
      label: auth.token.label,
      splits: auth.token.splits,
      ...(await epochInfo()),
      now: Date.now(),
    },
    { headers: noStore },
  );
}

/**
 * Příjem cílových časů / mezičasů z OBD (#120): `{ items: [{ bib, split?, timeS }] }`.
 * Idempotentní, odpověď nese výsledek každé položky ve stejném pořadí.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { rok } = await params;
  const auth = await authorize(request, rok);
  if ("error" in auth) return auth.error;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400, headers: noStore });
  }
  const parsed = deviceBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid",
        issues: parsed.error.issues
          .slice(0, 10)
          .map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      },
      { status: 422, headers: noStore },
    );
  }
  const forbidden = parsed.data.items.find(
    (item) => !tokenAllowsSplit(auth.token.splits, item.split),
  );
  if (forbidden) {
    return NextResponse.json(
      { error: "split-not-allowed", split: forbidden.split },
      { status: 403, headers: noStore },
    );
  }
  try {
    const results = await applyDeviceItems(parsed.data.items, auth.token);
    return NextResponse.json(
      {
        ok: true,
        results,
        summary: summarize(results.map((r) => r.outcome)),
        ...(await epochInfo()),
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("[race/splits] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server" }, { status: 500, headers: noStore });
  }
}
