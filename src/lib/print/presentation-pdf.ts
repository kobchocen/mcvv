import { jsPDF } from "jspdf";
import { autoTable, type CellDef } from "jspdf-autotable";

import type { ReceiptFonts } from "@/lib/receipts/fonts";

import type { AlphabetRow, PresentationBlock } from "./presentation-core";

const FONT = "DejaVu";
const MARGIN = 14;
// Stejná paleta jako tisková startovka a PDF doklad.
const INK: [number, number, number] = [15, 42, 28];
const MUTED: [number, number, number] = [93, 109, 99];
const ACCENT: [number, number, number] = [226, 83, 28];
const PAPER: [number, number, number] = [247, 249, 246];
const DUE: [number, number, number] = [180, 30, 30];
const SITE = "www.mcvv.org";

export type PresentationPdfLabels = {
  brand: string;
  title: string;
  subtitle: string;
  summary: string;
  colBib: string;
  colTime: string;
  colName: string;
  colBirth: string;
  colClub: string;
  colCategory: string;
  colFee: string;
  colRegistration: string;
  registration: (label: string) => string;
  /** Řádek součtu bloku: počet, startovné, uhrazeno. */
  blockTotal: (block: PresentationBlock) => string;
  due: (amount: number) => string;
  settled: string;
  overpaid: (amount: number) => string;
  currency: (amount: number) => string;
  footer: string;
  page: (page: number, pages: number) => string;
  empty: string;
};

function createDoc(fonts: ReceiptFonts, title: string): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("DejaVuSans.ttf", fonts.regular);
  doc.addFont("DejaVuSans.ttf", FONT, "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
  doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold");
  doc.setProperties({ title, subject: title, creator: SITE });
  return doc;
}

function text(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  options: { size?: number; bold?: boolean; color?: [number, number, number] } = {},
  align?: "right" | "center",
) {
  doc.setFont(FONT, options.bold ? "bold" : "normal");
  doc.setFontSize(options.size ?? 10);
  doc.setTextColor(...(options.color ?? [0, 0, 0]));
  doc.text(value, x, y, align ? { align } : undefined);
}

/** Úzká hlavička (na každé stránce stejná, šetří toner i místo). Vrací spodní okraj. */
function header(doc: jsPDF, labels: PresentationPdfLabels): number {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...INK);
  doc.rect(0, 0, width, 14, "F");
  doc.setFillColor(...ACCENT);
  doc.rect(0, 14, width, 1, "F");
  text(doc, labels.brand, MARGIN, 9, { size: 8.5, bold: true, color: [255, 255, 255] });
  text(
    doc,
    labels.title,
    width - MARGIN,
    9.2,
    { size: 11, bold: true, color: [255, 255, 255] },
    "right",
  );
  return 15;
}

function footers(doc: jsPDF, labels: PresentationPdfLabels) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, height - 12, width - MARGIN, height - 12);
    text(doc, labels.footer, MARGIN, height - 7.5, { size: 7.5, color: MUTED });
    text(
      doc,
      labels.page(page, pages),
      width - MARGIN,
      height - 7.5,
      { size: 7.5, color: MUTED },
      "right",
    );
  }
}

function intro(doc: jsPDF, labels: PresentationPdfLabels): number {
  let y = header(doc, labels) + 7;
  text(doc, labels.subtitle, MARGIN, y, { size: 9.5, bold: true, color: INK });
  y += 5;
  text(doc, labels.summary, MARGIN, y, { size: 8.5, color: MUTED });
  return y + 3;
}

const STYLES = {
  font: FONT,
  fontSize: 8.8,
  cellPadding: { top: 1.1, bottom: 1.1, left: 1.6, right: 1.6 },
  textColor: [22, 28, 24] as [number, number, number],
  overflow: "ellipsize" as const,
  valign: "middle" as const,
};

/**
 * Prezentace podle přihlášek (A4 na výšku): jeden blok na přihlášku – číslo, start, jméno,
 * ročník, klub, kategorie, startovné; pod ním součet a **zbývá uhradit**. Blok se nedělí
 * mezi stránky; `pagePerRegistration` dá každou přihlášku na samostatnou stránku.
 */
export function renderPresentationPdf(
  blocks: readonly PresentationBlock[],
  labels: PresentationPdfLabels,
  fonts: ReceiptFonts,
  options: { pagePerRegistration?: boolean } = {},
): Uint8Array {
  const doc = createDoc(fonts, labels.title);
  let y = intro(doc, labels);
  if (blocks.length === 0) {
    text(doc, labels.empty, MARGIN, y + 10, { size: 11, color: MUTED });
  }
  blocks.forEach((block, index) => {
    const dueText =
      block.due > 0
        ? labels.due(block.due)
        : block.overpaid > 0
          ? labels.overpaid(block.overpaid)
          : labels.settled;
    const foot: CellDef[][] = [
      [
        {
          content: labels.blockTotal(block),
          colSpan: 5,
          styles: { fontStyle: "normal", textColor: MUTED },
        },
        {
          content: dueText,
          colSpan: 2,
          styles: { halign: "right", textColor: block.due > 0 ? DUE : INK, fontSize: 10 },
        },
      ],
    ];
    autoTable(doc, {
      startY: index === 0 ? y + 2 : y + 5,
      theme: "plain",
      pageBreak: options.pagePerRegistration && index > 0 ? "always" : "avoid",
      rowPageBreak: "avoid",
      margin: { left: MARGIN, right: MARGIN, top: 20, bottom: 18 },
      head: [
        [
          {
            content: labels.registration(block.label),
            colSpan: 7,
            styles: {
              fillColor: [255, 255, 255],
              textColor: INK,
              fontSize: 10.5,
              cellPadding: { top: 1, bottom: 1.6, left: 0, right: 0 },
            },
          },
        ],
        [
          labels.colBib,
          labels.colTime,
          labels.colName,
          labels.colBirth,
          labels.colClub,
          labels.colCategory,
          { content: labels.colFee, styles: { halign: "right" } },
        ],
      ],
      body: block.rows.map((row) => [
        row.bib ? String(row.bib) : "—",
        row.time || "—",
        row.name,
        row.birthYear,
        row.club,
        row.categoryName,
        labels.currency(row.fee),
      ]),
      foot,
      showHead: "everyPage",
      showFoot: "lastPage",
      styles: STYLES,
      headStyles: { font: FONT, fontStyle: "bold", fillColor: INK, textColor: 255, fontSize: 8 },
      footStyles: { font: FONT, fontStyle: "bold", fillColor: PAPER, textColor: INK },
      alternateRowStyles: { fillColor: PAPER },
      columnStyles: {
        0: { cellWidth: 12, halign: "right", fontStyle: "bold" },
        1: { cellWidth: 18, textColor: INK },
        2: { cellWidth: 52, fontStyle: "bold" },
        3: { cellWidth: 12, textColor: MUTED },
        4: { cellWidth: "auto", textColor: MUTED },
        5: { cellWidth: 28 },
        6: { cellWidth: 20, halign: "right" },
      },
      willDrawPage: (data) => {
        if (data.pageNumber > 1 || index > 0) header(doc, labels);
      },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  });
  footers(doc, labels);
  return new Uint8Array(doc.output("arraybuffer"));
}

/** Abecední seznam (A4 na výšku): číslo, start, jméno, ročník, klub, kategorie, přihláška. */
export function renderAlphabetPdf(
  rows: readonly AlphabetRow[],
  labels: PresentationPdfLabels,
  fonts: ReceiptFonts,
): Uint8Array {
  const doc = createDoc(fonts, labels.title);
  const y = intro(doc, labels);
  if (rows.length === 0) {
    text(doc, labels.empty, MARGIN, y + 10, { size: 11, color: MUTED });
  } else {
    let lastInitial = "";
    const groupStarts = new Set<number>();
    rows.forEach((row, index) => {
      const initial = row.name.trim().charAt(0).toLocaleUpperCase("cs");
      if (index > 0 && initial !== lastInitial) groupStarts.add(index);
      lastInitial = initial;
    });
    autoTable(doc, {
      startY: y + 2,
      theme: "plain",
      margin: { left: MARGIN, right: MARGIN, top: 20, bottom: 18 },
      head: [
        [
          labels.colName,
          labels.colBib,
          labels.colTime,
          labels.colBirth,
          labels.colClub,
          labels.colCategory,
          { content: labels.colRegistration, styles: { halign: "right" } },
        ],
      ],
      body: rows.map((row) => [
        row.name,
        row.bib ? String(row.bib) : "—",
        row.time || "—",
        row.birthYear,
        row.club,
        row.categoryId,
        row.registrationLabel,
      ]),
      styles: STYLES,
      headStyles: { font: FONT, fontStyle: "bold", fillColor: INK, textColor: 255, fontSize: 8 },
      alternateRowStyles: { fillColor: PAPER },
      columnStyles: {
        0: { cellWidth: 58, fontStyle: "bold" },
        1: { cellWidth: 12, halign: "right", fontStyle: "bold" },
        2: { cellWidth: 18, textColor: INK },
        3: { cellWidth: 12, textColor: MUTED },
        4: { cellWidth: "auto", textColor: MUTED },
        5: { cellWidth: 10, halign: "center" },
        6: { cellWidth: 20, halign: "right", fontStyle: "bold", fontSize: 10 },
      },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 6 && groupStarts.has(data.row.index)) {
          doc.setDrawColor(190, 201, 193);
          doc.setLineWidth(0.25);
          doc.line(MARGIN, data.cell.y, doc.internal.pageSize.getWidth() - MARGIN, data.cell.y);
        }
      },
      willDrawPage: (data) => {
        if (data.pageNumber > 1) header(doc, labels);
      },
    });
  }
  footers(doc, labels);
  return new Uint8Array(doc.output("arraybuffer"));
}
