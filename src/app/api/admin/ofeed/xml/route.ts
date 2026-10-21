import { getSession } from "@/lib/auth/session";
import { canManageLiveResults } from "@/lib/auth/roles";
import { buildCurrentResultList } from "@/lib/ofeed/publisher";

export const dynamic = "force-dynamic";

/** Stažení aktuálního IOF XML ResultList (záloha pro ruční upload v OFeed). Jen admin. */
export async function GET() {
  const session = await getSession();
  if (!session || !canManageLiveResults(session.role))
    return new Response("Forbidden", { status: 403 });
  const { ctx, xml } = await buildCurrentResultList();
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="mcvv-${ctx.year}-resultlist-iof30.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
