import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import {
  PRINT_HEADER_BAND_MM,
  type OfficialLogoImage,
  drawOfficialLogo,
  officialLogoPrintWidthMm,
  officialLogoSize,
} from "@/lib/print/official-logo-shared";

const FONT = "DejaVu";
const MARGIN = 14;
const INK: [number, number, number] = [15, 42, 28];
const MUTED: [number, number, number] = [93, 109, 99];
const ACCENT: [number, number, number] = [226, 83, 28];
const PAPER: [number, number, number] = [247, 249, 246];

export type ResultsPdfCategoryGroup = {
  name: string;
  rows: {
    rank: string;
    runnerName: string;
    birthYear: string;
    clubName: string;
    timeLabel: string;
  }[];
};

export type ResultsPdfInput = {
  year: number;
  total: number;
  dateLabel?: string | null;
  weatherLabel?: string | null;
  groups: ResultsPdfCategoryGroup[];
};

export type ResultsPdfFonts = {
  regular: string;
  bold?: string;
};

/** Čas výsledku jako m:ss (stejný formát jako tlačítko PDF na stránce výsledků). */
export function formatResultsTime(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

/**
 * Veřejné PDF výsledků ročníku. Tmavé barvy z brandmanuálu a oficiální logo
 * (stejné jako tiskové sestavy statistik a startovky).
 */
export function renderResultsPdf(
  input: ResultsPdfInput,
  logo: OfficialLogoImage,
  fonts?: ResultsPdfFonts,
): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  let fontOk = false;
  if (fonts?.regular) {
    doc.addFileToVFS("DejaVuSans.ttf", fonts.regular);
    doc.addFont("DejaVuSans.ttf", FONT, "normal");
    if (fonts.bold) {
      doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
      doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold");
    }
    doc.setFont(FONT, "normal");
    fontOk = true;
  }
  const font = fontOk ? FONT : "helvetica";
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const band = PRINT_HEADER_BAND_MM;
  doc.setFillColor(...INK);
  doc.rect(0, 0, width, band, "F");
  doc.setFillColor(...ACCENT);
  doc.rect(0, band, width, 1.2, "F");
  const logoW = officialLogoPrintWidthMm();
  const logoH = officialLogoSize(logoW).height;
  drawOfficialLogo(doc, logo, MARGIN, (band - logoH) / 2, logoW, "mcvv-logo-dark");
  doc.setFont(font, "bold");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(`Výsledky ročníku ${input.year}`, width - MARGIN, band / 2 + 1.2, { align: "right" });

  let y = band + 10;
  doc.setFont(font, "normal");
  doc.setTextColor(...INK);
  if (input.dateLabel) {
    doc.setFontSize(10);
    doc.text(input.dateLabel, MARGIN, y);
    y += 5;
  }
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text(`Počet účastníků: ${input.total}`, MARGIN, y);
  y += 5;
  if (input.weatherLabel) {
    doc.text(`Počasí: ${input.weatherLabel}`, MARGIN, y);
    y += 6;
  } else {
    y += 1;
  }

  input.groups.forEach((group) => {
    if (group.rows.length === 0) return;
    doc.setFillColor(...INK);
    doc.rect(MARGIN, y - 3, width - 2 * MARGIN, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont(font, "bold");
    doc.setFontSize(9);
    doc.text(`${group.name} (${group.rows.length})`, MARGIN + 2, y + 1);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["#", "Jméno", "Roč. nar.", "Klub", "Čas"]],
      body: group.rows.map((row) => [
        row.rank,
        row.runnerName,
        row.birthYear,
        row.clubName,
        row.timeLabel,
      ]),
      styles: { fontSize: 7.5, font, cellPadding: 1.2, textColor: [22, 28, 24] },
      headStyles: {
        fillColor: INK,
        textColor: 255,
        font,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: PAPER },
      margin: { left: MARGIN, right: MARGIN, top: band + 6, bottom: 16 },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont(font, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("Malá cena Velké Verandy · www.mcvv.org", width / 2, height - 8, { align: "center" });
  }

  doc.setProperties({
    title: `Výsledky ročníku ${input.year} – MCVV`,
    creator: "www.mcvv.org",
  });
  return new Uint8Array(doc.output("arraybuffer"));
}
