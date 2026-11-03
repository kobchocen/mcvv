import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron/auth";
import { cronGate } from "@/lib/cron/cadence";
import { env } from "@/lib/env";
import { remindersDryRun, runReminders } from "@/lib/reminders/job";
import { runLatePayment } from "@/lib/slots/late-pay-job";

export const dynamic = "force-dynamic";

/**
 * Plánovaný běh připomínek plateb (R1, nízká priorita) a doplatku standardních přihlášek
 * (e-mail „zaplaťte dnes“, automatické zrušení po lhůtě). ACA Job volá každou minutu: celý běh
 * jednou za 15 min, mezi tím jen pozdní přihlášky, když nějaká čeká na platbu – zrušení
 * po lhůtě tak proběhne do minuty (část 6).
 */
export async function POST(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const gate = await cronGate("reminders", { fastAllowed: true });
    if (gate.slow) return NextResponse.json({ ok: true, ...(await runReminders()) });
    if (!gate.fast) return NextResponse.json({ ok: true, skipped: "cadence" });
    const dryRun = remindersDryRun();
    return NextResponse.json({
      ok: true,
      fast: true,
      dryRun,
      latePay: await runLatePayment({ dryRun }),
    });
  } catch (error) {
    console.error("[cron/reminders] failed", error);
    return NextResponse.json({ ok: false, error: "job failed" }, { status: 500 });
  }
}
