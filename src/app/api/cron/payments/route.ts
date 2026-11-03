import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron/auth";
import { cronGate } from "@/lib/cron/cadence";
import { env } from "@/lib/env";
import { runPaymentsJob } from "@/lib/payments/job";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Plánovaný běh párování plateb Fio (1 dotaz na Fio za běh). ACA Job volá každou minutu;
 * páruje se každých 15 min, každou minutu jen když pozdní přihláška čeká na platbu (část 6).
 * Limit Fio (1 dotaz / 30 s na token) hlídá job sám (`FIO_MIN_INTERVAL_MS`).
 */
export async function POST(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const gate = await cronGate("payments", { fastAllowed: true });
    if (!gate.run) return NextResponse.json({ ok: true, skipped: "cadence" });
    const result = await runPaymentsJob();
    // Selhání Fio (síť, 5xx, 409) vrací 200 s ok=false: job to dožene za 15 min, 5xx by jen
    // spouštělo opakování ACA Jobu a narazilo na limit Fio 1 dotaz / 30 s. Log viz job.ts.
    return NextResponse.json({ ok: result.status !== "failed", fast: gate.fast, ...result });
  } catch (error) {
    // job.ts už zalogoval detail (bez tokenu); tady jen to, co selhalo mimo něj.
    console.error(
      "[cron/payments] job threw",
      error instanceof Error ? error.message.slice(0, 200) : "unknown error",
    );
    return NextResponse.json({ ok: false, error: "job failed" }, { status: 500 });
  }
}
