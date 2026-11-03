import { NextRequest } from "next/server";

import { suggestRunners } from "@/lib/admin/runner-directory";
import { adminRouteAccess } from "@/lib/admin/staff";
import { NO_STORE } from "@/lib/http/no-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/bezci?q=… – našeptávač v číselníku běžců (jen admin, stejně jako stránka).
 * Hledá podle jména (slova v libovolném pořadí), id, dřívějšího jména a ročníku narození.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const access = await adminRouteAccess();
  if (!access.ok) {
    return access.response;
  }
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length > 60) {
    return Response.json([], { headers: NO_STORE });
  }
  return Response.json(await suggestRunners(q), { headers: NO_STORE });
}
