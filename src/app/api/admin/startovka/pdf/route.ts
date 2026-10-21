import { staffAccess } from "@/lib/admin/staff";
import { FIRST_EDITION_YEAR } from "@/lib/entries/year";
import { NO_STORE, pdfResponse } from "@/lib/print/http";
import { loadReceiptFonts } from "@/lib/receipts/fonts";
import { renderStartListPdf } from "@/lib/race/startlist-pdf";
import { startListPdfLabels } from "@/lib/race/startlist-pdf-labels";
import {
  latestEditionYear,
  loadPublicStartList,
  loadStartSettings,
} from "@/lib/race/startlist-load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/startovka/pdf?rok=2026&lang=cs – tisková startovka (A4, PDF).
 * Jen pro pořadatele / administrátory; zveřejnění startovky na webu na tom nezávisí.
 */
export async function GET(request: Request): Promise<Response> {
  const access = await staffAccess({ status: 401, body: "Unauthorized" });
  if (!access.ok) {
    return access.response;
  }
  const params = new URL(request.url).searchParams;
  const rawYear = params.get("rok") ?? "";
  const year = /^\d{4}$/.test(rawYear) ? Number(rawYear) : await latestEditionYear();
  if (year < 2000 || year > 2100) {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }
  const locale = params.get("lang") === "en" ? "en" : "cs";
  const settings = await loadStartSettings(year);
  const { rows } = await loadPublicStartList(year, settings.model);
  const labels = startListPdfLabels(locale, {
    year,
    editionNumber: settings.editionId ?? year - FIRST_EDITION_YEAR + 1,
    raceDate: settings.raceDate,
    model: settings.model,
    count: rows.length,
    generatedAt: new Date(),
  });
  const pdf = renderStartListPdf(rows, settings.model, labels, await loadReceiptFonts());
  return pdfResponse(pdf, `mcvv-startovka-${year}.pdf`);
}
