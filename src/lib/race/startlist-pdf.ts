import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

import type { ReceiptFonts } from "@/lib/receipts/fonts";

import { formatClock, startSeriesForBib, type StartModel } from "./start-time";
import type { PublicStartRow } from "./startlist-load";

const FONT = "DejaVu";
const MARGIN = 14;
// Stejná paleta jako PDF doklad: tmavě zelená (INK), oranžový akcent MCVV, papír.
const INK: [number, number, number] = [15, 42, 28];
const MUTED: [number, number, number] = [93, 109, 99];
const ACCENT: [number, number, number] = [226, 83, 28];
const PAPER: [number, number, number] = [247, 249, 246];
const SITE = "www.mcvv.org";

export type StartListPdfLabels = {
  brandTop: string;
  brandBottom: string;
  brandMark: string;
  title: string;
  edition: string;
  raceDay: string;
  model: string;
  count: string;
  legend: string;
  colTime: string;
  colBib: string;
  colName: string;
  colBirth: string;
  colClub: string;
  colCategory: string;
  footer: string;
  page: (page: number, pages: number) => string;
  empty: string;
};

/**
 * Tisková startovka (A4 na výšku): řazeno podle startovního času, obě vlny prolnuté,
 * čísla 2. startu oranžově. Jen pro pořadatele (route /api/admin/startovka/pdf).
 */
export function renderStartListPdf(
  rows: PublicStartRow[],
  model: StartModel,
  labels: StartListPdfLabels,
  fonts: ReceiptFonts,
): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("DejaVuSans.ttf", fonts.regular);
  doc.addFont("DejaVuSans.ttf", FONT, "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
  doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold");
  doc.setProperties({ title: labels.title, subject: labels.title, creator: SITE });

  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const right = width - MARGIN;
  const text = (
    value: string,
    x: number,
    y: number,
    options: { size?: number; bold?: boolean; color?: [number, number, number] } = {},
    align?: "right" | "center",
  ) => {
    doc.setFont(FONT, options.bold ? "bold" : "normal");
    doc.setFontSize(options.size ?? 10);
    doc.setTextColor(...(options.color ?? [0, 0, 0]));
    doc.text(value, x, y, align ? { align } : undefined);
  };

  const header = (first: boolean) => {
    const band = first ? 30 : 16;
    doc.setFillColor(...INK);
    doc.rect(0, 0, width, band, "F");
    doc.setFillColor(...ACCENT);
    doc.rect(0, band, width, 1.2, "F");
    const markSize = first ? 12 : 8;
    const markY = (band - markSize) / 2;
    doc.roundedRect(MARGIN, markY, markSize, markSize, 1.6, 1.6, "F");
    text(
      labels.brandMark,
      MARGIN + markSize / 2,
      markY + markSize * 0.72,
      {
        size: first ? 17 : 11,
        bold: true,
        color: [255, 255, 255],
      },
      "center",
    );
    const brandX = MARGIN + markSize + 4;
    if (first) {
      text(labels.brandTop, brandX, markY + 4.8, { size: 9.5, bold: true, color: [255, 255, 255] });
      text(labels.brandBottom, brandX, markY + 10, { size: 9.5, bold: true, color: ACCENT });
      text(labels.title, right, 13, { size: 17, bold: true, color: [255, 255, 255] }, "right");
      text(
        `${labels.edition} · ${labels.raceDay}`,
        right,
        20.5,
        { size: 9, color: [210, 222, 214] },
        "right",
      );
    } else {
      text(`${labels.brandTop} ${labels.brandBottom}`, brandX, band / 2 + 1.3, {
        size: 8.5,
        bold: true,
        color: [255, 255, 255],
      });
      text(
        labels.title,
        right,
        band / 2 + 1.5,
        { size: 10.5, bold: true, color: [255, 255, 255] },
        "right",
      );
    }
    return band;
  };

  const firstBand = header(true);
  let y = firstBand + 8;
  text(labels.model, MARGIN, y, { size: 9.5, color: INK, bold: true });
  text(labels.count, right, y, { size: 9.5, color: INK, bold: true }, "right");
  y += 5;
  text(labels.legend, MARGIN, y, { size: 8, color: MUTED });
  y += 3;

  if (rows.length === 0) {
    text(labels.empty, MARGIN, y + 10, { size: 11, color: MUTED });
  }

  const body = rows.map((row) => [
    row.time,
    String(row.bib),
    row.name,
    row.birthYear,
    row.club,
    row.categoryName,
  ]);
  const series = rows.map((row) => startSeriesForBib(model, row.bib));
  let lastMinute = "";
  const minuteStarts = new Set<number>();
  rows.forEach((row, index) => {
    const minute = row.time.slice(0, 5);
    if (minute !== lastMinute && index > 0) {
      minuteStarts.add(index);
    }
    lastMinute = minute;
  });

  if (rows.length > 0) {
    autoTable(doc, {
      startY: y,
      theme: "plain",
      margin: { left: MARGIN, right: MARGIN, top: 22, bottom: 18 },
      head: [
        [
          labels.colTime,
          labels.colBib,
          labels.colName,
          labels.colBirth,
          labels.colClub,
          labels.colCategory,
        ],
      ],
      body,
      styles: {
        font: FONT,
        fontSize: 8.6,
        cellPadding: { top: 1.05, bottom: 1.05, left: 1.6, right: 1.6 },
        textColor: [22, 28, 24],
        overflow: "ellipsize",
        valign: "middle",
      },
      headStyles: { font: FONT, fontStyle: "bold", fillColor: INK, textColor: 255, fontSize: 8 },
      alternateRowStyles: { fillColor: PAPER },
      columnStyles: {
        0: { cellWidth: 18, textColor: INK },
        1: { cellWidth: 12, halign: "right", fontStyle: "bold" },
        2: { cellWidth: 56, fontStyle: "bold" },
        3: { cellWidth: 12, textColor: MUTED },
        4: { cellWidth: "auto", textColor: MUTED },
        5: { cellWidth: 30 },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 1 && series[data.row.index] === 2) {
          data.cell.styles.textColor = ACCENT;
        }
      },
      didDrawCell: (data) => {
        // Tenká linka mezi minutami (kreslí se po poslední buňce řádku, ať ji nic nepřekryje).
        if (
          data.section === "body" &&
          data.column.index === 5 &&
          minuteStarts.has(data.row.index)
        ) {
          doc.setDrawColor(190, 201, 193);
          doc.setLineWidth(0.25);
          doc.line(MARGIN, data.cell.y, right, data.cell.y);
        }
      },
      willDrawPage: (data) => {
        if (data.pageNumber > 1) {
          header(false);
        }
      },
    });
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, height - 12, right, height - 12);
    text(labels.footer, MARGIN, height - 7.5, { size: 7.5, color: MUTED });
    text(labels.page(page, pages), right, height - 7.5, { size: 7.5, color: MUTED }, "right");
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

export function startModelLine(model: StartModel, template: string): string {
  return template
    .replace("{zero}", formatClock(model.zeroSeconds))
    .replace("{interval}", String(model.intervalSeconds))
    .replace("{second}", String(model.secondStartFrom));
}
