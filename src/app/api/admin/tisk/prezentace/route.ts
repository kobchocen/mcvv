import {
  buildAlphabetRows,
  buildPresentationBlocks,
  presentationTotals,
} from "@/lib/print/presentation-core";
import { NO_STORE, pdfResponse, staffOnly } from "@/lib/print/http";
import { presentationPdfLabels } from "@/lib/print/presentation-labels";
import { renderAlphabetPdf, renderPresentationPdf } from "@/lib/print/presentation-pdf";
import { loadPresentationData } from "@/lib/print/load-presentation";
import { loadReceiptFonts } from "@/lib/receipts/fonts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/tisk/prezentace?sestava=prihlasky|abeceda&stranky=1&lang=cs
 * Tiskové sestavy pro prezentaci v den závodu (#125), jen pořadatel / administrátor.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = await staffOnly();
  if (denied) {
    return denied;
  }
  const params = new URL(request.url).searchParams;
  const report = params.get("sestava") ?? "prihlasky";
  if (report !== "prihlasky" && report !== "abeceda") {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }
  const locale = params.get("lang") === "en" ? "en" : "cs";
  const data = await loadPresentationData();
  const fonts = await loadReceiptFonts();
  const blocks = buildPresentationBlocks(data.registrations, data.lines, data.paidById, data.model);
  const totals = presentationTotals(blocks);
  const generatedAt = new Date();
  if (report === "abeceda") {
    const rows = buildAlphabetRows(data.registrations, data.lines, data.model);
    const labels = presentationPdfLabels(locale, "alphabet", {
      year: data.year,
      generatedAt,
      totals: { ...totals, runners: rows.length },
    });
    return pdfResponse(renderAlphabetPdf(rows, labels, fonts), `mcvv-abeceda-${data.year}.pdf`);
  }
  const labels = presentationPdfLabels(locale, "presentation", {
    year: data.year,
    generatedAt,
    totals,
  });
  const pdf = renderPresentationPdf(blocks, labels, fonts, {
    pagePerRegistration: params.get("stranky") === "1",
  });
  return pdfResponse(pdf, `mcvv-prezentace-${data.year}.pdf`);
}
