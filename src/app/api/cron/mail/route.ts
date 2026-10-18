import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron/auth";
import { env } from "@/lib/env";
import { processMailQueue } from "@/lib/mail/queue";
import { continueNewsletters } from "@/lib/newsletter/runner";

export const dynamic = "force-dynamic";

/**
 * Plánovaný běh e-mailové fronty (ACA Job / GitHub Action každých 15 min):
 * nejdřív fronta (potvrzení, připomínky, alerty), pak zbytek rozpočtu pro newsletter.
 */
export async function POST(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const queue = await processMailQueue();
    const newsletter = await continueNewsletters();
    return NextResponse.json({ ok: true, queue, newsletter });
  } catch (error) {
    console.error("[cron/mail] failed", error);
    return NextResponse.json({ ok: false, error: "job failed" }, { status: 500 });
  }
}
