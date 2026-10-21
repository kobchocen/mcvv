import { loadReceiptFonts } from "@/lib/receipts/fonts";
import { NO_STORE, pdfResponse, staffOnly } from "@/lib/print/http";
import { loadStatsReport, statsFilename } from "@/lib/print/load-stats";
import { renderStatsPdf } from "@/lib/print/render-stats";
import { isStatSlug } from "@/lib/stats/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/statistiky/{slug}/pdf – jednostránková tisková sestava statistiky (A4, česky)
 * pro tisk a vyvěšení na závodě. Jen pořadatel / admin; anonymní uživatel 401.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const denied = await staffOnly();
  if (denied) {
    return denied;
  }
  const { slug } = await context.params;
  if (!isStatSlug(slug)) {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }
  const pdf = renderStatsPdf(await loadStatsReport(slug), await loadReceiptFonts());
  return pdfResponse(pdf, statsFilename(slug));
}
