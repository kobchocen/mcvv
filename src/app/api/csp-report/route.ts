import { parseCspReport } from "@/lib/security/headers";

export const dynamic = "force-dynamic";

const MAX_BYTES = 16 * 1024;

/** Receives Content-Security-Policy-Report-Only violations and logs a compact line each. */
export async function POST(request: Request): Promise<Response> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return new Response(null, { status: 413 });
  let payload: unknown = null;
  try {
    const text = await request.text();
    if (text.length <= MAX_BYTES) payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  for (const violation of parseCspReport(payload)) {
    console.warn(`[csp-report] ${JSON.stringify(violation)}`);
  }
  return new Response(null, { status: 204 });
}
