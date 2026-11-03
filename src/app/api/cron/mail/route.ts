import { NextResponse } from "next/server";

import { cronAuthorized } from "@/lib/cron/auth";
import { cronGate } from "@/lib/cron/cadence";
import { runFreeAutoConfirm } from "@/lib/entries/auto-confirm";
import { env } from "@/lib/env";
import { processMailQueue } from "@/lib/mail/queue";
import { runOrganizerDigest } from "@/lib/messages/notify";
import { continueNewsletters } from "@/lib/newsletter/runner";

export const dynamic = "force-dynamic";

/**
 * Plánovaný běh e-mailové fronty (každých 15 min; ACA Job volá každou minutu, routa
 * mezi tím nic nedělá – transakční e-maily odcházejí hned přes sendMail):
 * denní souhrn pořadateli (zprávy, změny přihlášek), fronta (potvrzení, připomínky, alerty, zprávy), pak zbytek pro newsletter.
 */
export async function POST(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const gate = await cronGate("mail", { fastAllowed: false });
    if (!gate.run) return NextResponse.json({ ok: true, skipped: "cadence" });
    // Denní souhrn pro pořadatele (zprávy a změny přihlášek; max. 1× denně, jen zapnuté
    // sekce) – před frontou, aby odešel ve stejném běhu.
    const messages = await runOrganizerDigest().catch((error) => {
      console.error("[cron/mail] message digest failed", error);
      return { skipped: "error", threads: 0, queued: false };
    });
    // Přihlášky se startovným 0 Kč: automatické potvrzení po 45 min bez změny (potvrzení
    // jde do fronty a odejde hned v tomto běhu).
    const freeEntries = await runFreeAutoConfirm().catch((error) => {
      console.error("[cron/mail] free auto-confirm failed", error);
      return { candidates: 0, confirmed: 0, mailed: 0, error: true };
    });
    const queue = await processMailQueue();
    const newsletter = await continueNewsletters();
    return NextResponse.json({ ok: true, queue, newsletter, messages, freeEntries });
  } catch (error) {
    console.error("[cron/mail] failed", error);
    return NextResponse.json({ ok: false, error: "job failed" }, { status: 500 });
  }
}
