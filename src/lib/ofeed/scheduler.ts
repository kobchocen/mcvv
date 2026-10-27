import { env } from "@/lib/env";
import { expireTestRunIfDue } from "@/lib/live/test-run";

import { PUBLISH_INTERVAL_MS } from "./publisher-core";
import { runOfeedPublish } from "./publisher";

declare global {
  var mcvvOfeedScheduler: NodeJS.Timeout | undefined;
}

/**
 * Background uploader do OFeed (~30 s). Startuje z `instrumentation.ts` v každé replice;
 * zapisuje jen držitel lease (publisher.acquireLease), takže do OFeed píše vždy jeden.
 * Když publikace není zapnutá, tick je jen pár SELECTů nastavení (OFeed, testovací běh).
 */
export function startOfeedScheduler(): void {
  if (env.OFEED_SCHEDULER === "false" || globalThis.mcvvOfeedScheduler) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      // Testovací běh (#186) se po vypršení / v den závodu ukončí a uklidí i bez návštěvy adminu.
      await expireTestRunIfDue().catch((error: unknown) =>
        console.error("[test-run] expiry failed", error instanceof Error ? error.message : error),
      );
      await runOfeedPublish("scheduler");
    } catch (error) {
      console.error(
        "[ofeed] scheduler tick failed",
        error instanceof Error ? error.message : error,
      );
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, PUBLISH_INTERVAL_MS);
  timer.unref();
  globalThis.mcvvOfeedScheduler = timer;
}
