import type { NextRequest } from "next/server";

import { getAccess, sectionRouteAccess } from "@/lib/admin/access";
import { loadUnifiedAll } from "@/lib/audit/unified";
import {
  parseUnifiedFilters,
  UNIFIED_CSV_LIMIT,
  unifiedCsv,
  type UnifiedSearchParams,
} from "@/lib/audit/unified-core";
import { NO_STORE } from "@/lib/http/no-store";

/** CSV jednotného auditu (P9) se stejnými filtry jako obrazovka; jen při zapnutém přepínači. */
export async function GET(request: NextRequest) {
  const access = await sectionRouteAccess("audit", "read");
  if (!access.ok) return access.response;
  if (!(await getAccess()).v2) return new Response("Not found", { status: 404, headers: NO_STORE });
  const params = Object.fromEntries(request.nextUrl.searchParams) as UnifiedSearchParams;
  const rows = await loadUnifiedAll(parseUnifiedFilters(params), UNIFIED_CSV_LIMIT);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(unifiedCsv(rows), {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-${stamp}.csv"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
