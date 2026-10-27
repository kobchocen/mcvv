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
    // Selhání Fio (síť, 5xx, 409) vrací 200 s ok=false: job to dožene za 15 min, 5xx by jen
    // spouštělo opakování ACA Jobu a narazilo na limit Fio 1 dotaz / 30 s. Log viz job.ts.
    return NextResponse.json({ ok: result.status !== "failed", ...result });
  } catch (error) {
    // job.ts už zalogoval detail (bez tokenu); tady jen to, co selhalo mimo něj.
    console.error(
      "[cron/payments] job threw",
      error instanceof Error ? error.message.slice(0, 200) : "unknown error",
    );
    return NextResponse.json({ ok: false, error: "job failed" }, { status: 500 });
  }
}
