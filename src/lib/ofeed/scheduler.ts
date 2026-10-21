import { env } from "@/lib/env";

import { PUBLISH_INTERVAL_MS } from "./publisher-core";
import { runOfeedPublish } from "./publisher";

declare global {
  var mcvvOfeedScheduler: NodeJS.Timeout | undefined;
}

/**
 * Background uploader do OFeed (~30 s). Startuje z `instrumentation.ts` v každé replice;
 * zapisuje jen držitel lease (publisher.acquireLease), takže do OFeed píše vždy jeden.
 * Když publikace není zapnutá, tick je jen jeden SELECT nastavení.
 */
export function startOfeedScheduler(): void {
  if (env.OFEED_SCHEDULER === "false" || globalThis.mcvvOfeedScheduler) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
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
