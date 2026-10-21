import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron/auth";
import { env } from "@/lib/env";
import { runOfeedPublish } from "@/lib/ofeed/publisher";

export const dynamic = "force-dynamic";

/** Záložní spouštěč publikace do OFeed (když by neběžel scheduler v procesu). */
export async function POST(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runOfeedPublish("cron");
    return NextResponse.json({ ok: result.status !== "failed", ...result });
  } catch (error) {
    console.error("[cron/ofeed] failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "job failed" }, { status: 500 });
  }
}
