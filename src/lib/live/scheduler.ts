import { env } from "@/lib/env";

import { runTestModeScheduler } from "@/lib/testmode/run";

import { expireTestRunIfDue } from "./test-run";

/** Interval interního ticku dne závodu. */
export const LIVE_TICK_MS = 30_000;

declare global {
  var mcvvLiveScheduler: NodeJS.Timeout | undefined;
}

/**
 * Interní tick (~30 s) dne závodu. Startuje z `instrumentation.ts` v každé replice.
 * Testovací běh (#186) se po vypršení nebo v den závodu ukončí a uklidí i bez návštěvy adminu.
 * Vypnutí: `LIVE_SCHEDULER=false`.
 */
export function startLiveScheduler(): void {
  if (env.LIVE_SCHEDULER === "false" || globalThis.mcvvLiveScheduler) {
    return;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await expireTestRunIfDue();
      // Testovací režim B+: konec T+3h, likvidace T+5h, automatické spuštění podle nastavení.
      await runTestModeScheduler();
    } catch (error) {
      console.error("[live] scheduler tick failed", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, LIVE_TICK_MS);
  timer.unref();
  globalThis.mcvvLiveScheduler = timer;
}
