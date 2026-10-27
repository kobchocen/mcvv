import type { Instrumentation } from "next";

import { isPoolExhaustedError, poolExhaustedLogLine } from "@/lib/db/pool-alert";

/** Next.js server start hook: background uploader do OFeed (#122). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startOfeedScheduler } = await import("@/lib/ofeed/scheduler");
  startOfeedScheduler();
}

/** Short searchable warning for an exhausted DB pool (P2039, #199); Next.js logs the stack. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (isPoolExhaustedError(error)) console.warn(poolExhaustedLogLine(error, request, context));
};
