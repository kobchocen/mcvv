/** Next.js server start hook: background uploader do OFeed (#122). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startOfeedScheduler } = await import("@/lib/ofeed/scheduler");
  startOfeedScheduler();
}
