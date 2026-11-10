import { loadBibFonts } from "@/lib/print/bib-fonts";
import { loadCourseProfileData, loadMcvvLogo, loadYearBadge } from "@/lib/print/bib-assets";
import { bibFilename, parseBibPrintParams } from "@/lib/print/bibs-core";
import { NO_STORE, pdfResponse, staffOnly } from "@/lib/print/http";
import { loadBibCards } from "@/lib/print/load-bibs";
import { loadBibPartnerLogos } from "@/lib/print/partner-logos";
import { renderBibsPdf } from "@/lib/print/render-bibs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/tisk/cisla?mode=all|selected|blank&bibs=…&offset=&limit=&order=&red=…
 * PDF startovních čísel, A5 na šířku, jedno číslo na stránku. Jen pořadatel / admin.
 */
export async function GET(request: Request): Promise<Response> {
  const denied = await staffOnly();
  if (denied) {
    return denied;
  }
  const params = parseBibPrintParams(new URL(request.url).searchParams);
  if (!params) {
    return new Response("Bad request", { status: 400, headers: NO_STORE });
  }
  const [logos, fonts, mcvvLogo, profile] = await Promise.all([
    loadBibPartnerLogos(),
    loadBibFonts(),
    loadMcvvLogo(),
    loadCourseProfileData(),
  ]);
  const { year, cards } = await loadBibCards(params, logos.length);
  const yearBadge = await loadYearBadge(year);
  const pdf = renderBibsPdf(
    cards,
    {
      fonts,
      logos: logos.map((item) => item.logo),
      mcvvLogo,
      profile,
      yearBadge,
      year,
    },
    { title: `Startovní čísla MCVV ${year}` },
  );
  return pdfResponse(pdf, bibFilename(params.mode, year, cards[0]?.bib, cards.at(-1)?.bib));
}
