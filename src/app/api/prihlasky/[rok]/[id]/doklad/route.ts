import { getSession } from "@/lib/auth/session";
import { loadReceiptFonts } from "@/lib/receipts/fonts";
import { receiptTranslator } from "@/lib/receipts/labels";
import { loadReceiptFor } from "@/lib/receipts/load";
import { parseReceiptLocale, receiptFilename } from "@/lib/receipts/receipt-core";
import { renderReceiptPdf } from "@/lib/receipts/render-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function int(value: string, min: number, max: number): number | null {
  if (!/^\d{1,4}$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: NO_STORE });
}

/**
 * GET /api/prihlasky/{rok}/{id}/doklad?lang=cs|en – PDF doklad o zaplacení.
 * Jen pro vlastníka přihlášky (shoda e-mailu, aktuální ročník) a pořadatele;
 * jen pro plně uhrazenou přihlášku. Jinak 404 (nic neprozrazuje).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ rok: string; id: string }> },
): Promise<Response> {
  const { rok, id: rawId } = await context.params;
  const year = int(rok, 2000, 2100);
  const id = int(rawId, 1, 9999);
  if (!year || !id) {
    return notFound();
  }
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401, headers: NO_STORE });
  }
  const receipt = await loadReceiptFor(session, year, id);
  if (!receipt) {
    return notFound();
  }
  const locale = parseReceiptLocale(new URL(request.url).searchParams.get("lang"));
  const pdf = renderReceiptPdf(
    receipt,
    locale,
    receiptTranslator(locale),
    await loadReceiptFonts(),
  );
  return new Response(new Uint8Array(pdf), {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receiptFilename(year, id)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
