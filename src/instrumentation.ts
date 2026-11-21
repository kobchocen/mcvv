import type { Instrumentation } from "next";

import { isPoolExhaustedError, poolExhaustedLogLine } from "@/lib/db/pool-alert";

/** Next.js server start hook: interní tick dne závodu (ukončování testovacích běhů #186). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startLiveScheduler } = await import("@/lib/live/scheduler");
  startLiveScheduler();
}

/** Short searchable warning for an exhausted DB pool (P2039, #199); Next.js logs the stack. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (isPoolExhaustedError(error)) console.warn(poolExhaustedLogLine(error, request, context));
};
