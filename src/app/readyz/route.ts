import { prisma } from "@/lib/db/client";

const probeHeaders = {
  "Cache-Control": "no-store",
};

const readinessTimeoutMs = 2_000;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Readiness check timed out")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, readinessTimeoutMs);

    return Response.json({ status: "ready" }, { headers: probeHeaders });
  } catch {
    return Response.json(
      { status: "not_ready" },
      {
        headers: probeHeaders,
        status: 503,
      },
    );
  }
}
