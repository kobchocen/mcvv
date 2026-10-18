import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron/auth";
import { env } from "@/lib/env";
import { runPaymentsJob } from "@/lib/payments/job";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Plánovaný běh párování plateb Fio (ACA Job každých 15 min, 1 dotaz na Fio za běh). */
export async function POST(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPaymentsJob();
    return NextResponse.json({ ok: result.status !== "failed", ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "job failed" }, { status: 500 });
  }
}
