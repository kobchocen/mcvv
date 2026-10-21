import { raceDayAccess } from "@/lib/admin/staff";
import { writeAudit } from "@/lib/audit/log";
import {
  findEncodingIssues,
  renderObdExport,
  withTransliteratedNames,
  type ObdExportFormat,
} from "@/lib/raceday/obd-export";
import { loadObdExportData } from "@/lib/raceday/obd-export-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/den-zavodu/obd-export?format=txt|html[&nahradit=1]
 *
 * Export podkladů pro OBD 1:1 s legacy `data/prihl2obd.php`, ve windows-1250 (#117).
 * - `txt` (výchozí): jen data (`#kategorie`, `#oddily`, `#bezci`, `#startovka`),
 * - `html`: celá legacy stránka s `<pre>` bajt po bajtu.
 * Jen pro Časomíru (timing), pořadatele a admina; legacy byl bez autentizace.
 * Jméno, které nejde zapsat ve windows-1250, export zastaví (409 se seznamem) –
 * s `nahradit=1` se znaky přepíšou bez diakritiky a počet náhrad je v hlavičce.
 */
export async function GET(request: Request): Promise<Response> {
  const access = await raceDayAccess();
  if (!access.ok) {
    return access.response;
  }
  const params = new URL(request.url).searchParams;
  const format: ObdExportFormat = params.get("format") === "html" ? "html" : "txt";
  const replace = params.get("nahradit") === "1";

  const data = await loadObdExportData();
  const issues = findEncodingIssues(data);
  if (issues.length > 0 && !replace) {
    const lines = issues.map(
      (issue) =>
        `${issue.section}\t${issue.id}\t${issue.name}\t${issue.chars.join(" ")}\t→ ${issue.replacement}`,
    );
    return new Response(
      `Export zastaven – znaky, které nejdou zapsat ve windows-1250 (počet záznamů: ${issues.length}).\n` +
        `Opravte jména v číselníku, nebo stáhněte s náhradou (nahradit=1).\n\n${lines.join("\n")}\n`,
      { status: 409, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const file = renderObdExport(replace ? withTransliteratedNames(data) : data, format);
  await writeAudit({
    actor: access.session,
    action: "raceday.obd_export",
    target: `year:${data.year}`,
    detail: {
      format,
      replaced: replace ? issues.length : 0,
      categories: data.categories.length,
      clubs: data.clubs.length,
      runners: data.runners.length,
      starts: data.starts.length,
      bytes: file.bytes.length,
    },
  });
  return new Response(Buffer.from(file.bytes), {
    headers: {
      ...NO_STORE,
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "X-Obd-Replaced": String(replace ? issues.length : 0),
    },
  });
}
