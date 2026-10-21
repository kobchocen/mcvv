import { jsPDF } from "jspdf";

import type { ReceiptFonts } from "@/lib/receipts/fonts";

import type { BibCard, BibColor } from "./bibs-core";
import { bibBarcodeText, code128BPattern, LEGACY_QUIET_MODULES, patternBars } from "./code128";

const FONT = "DejaVu";
const PAGE_W = 210;
const HALF_H = 297 / 2;

/** Legacy CSS barvy čísla: black / green / red. */
const NUMBER_COLORS: Record<BibColor, [number, number, number]> = {
  black: [0, 0, 0],
  green: [0, 128, 0],
  red: [255, 0, 0],
};

/**
 * Rozměry čárového kódu jako legacy tisk (`sizefactor=2&size=60`, 96 dpi ≈ 0,2646 mm/px):
 * modul 2 px ≈ 0,53 mm, šířka pruhu 60 px ≈ 15,9 mm, svisle, start nahoře.
 */
export const BARCODE_MODULE_MM = 0.53;
export const BARCODE_WIDTH_MM = 15.9;

export type BibLogo = { data: Uint8Array; width: number; height: number };

export type BibLayout = {
  logo: { x: number; y: number; w: number; h: number };
  number: { x: number; baseline: number; maxWidth: number; size: number };
  barcode: { x: number; y: number };
  surname: { baseline: number; maxWidth: number; size: number };
  veteran: { x: number; baseline: number; size: number };
  bar: { x: number; y: number; w: number; h: number; split: number };
  title: { baseline: number; maxWidth: number; size: number };
};

/** Rozvržení jednoho čísla v půlce A4 (souřadnice v mm od horního okraje půlky). */
export const BIB_LAYOUT: BibLayout = {
  logo: { x: 18, y: 5, w: 174, h: 26 },
  number: { x: 98, baseline: 88, maxWidth: 158, size: 200 },
  barcode: { x: 187, y: 34 },
  surname: { baseline: 108, maxWidth: 168, size: 50 },
  veteran: { x: 199, baseline: 108, size: 48 },
  bar: { x: 8, y: 114, w: 194, h: 9.5, split: 0.56 },
  title: { baseline: 136.5, maxWidth: 186, size: 30 },
};

function drawBarcode(doc: jsPDF, bib: number, x: number, y: number) {
  const { bars, modules } = patternBars(code128BPattern(bibBarcodeText(bib)));
  const quiet = LEGACY_QUIET_MODULES * BARCODE_MODULE_MM;
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, BARCODE_WIDTH_MM, modules * BARCODE_MODULE_MM + 2 * quiet, "F");
  doc.setFillColor(0, 0, 0);
  for (const bar of bars) {
    doc.rect(
      x,
      y + quiet + bar.start * BARCODE_MODULE_MM,
      BARCODE_WIDTH_MM,
      bar.width * BARCODE_MODULE_MM,
      "F",
    );
  }
}

/** Velikost písma (pt), aby text nepřesáhl šířku. */
function fitSize(doc: jsPDF, text: string, size: number, maxWidth: number): number {
  doc.setFontSize(size);
  const width = doc.getTextWidth(text);
  return width > maxWidth ? (size * maxWidth) / width : size;
}

function drawLogo(doc: jsPDF, logo: BibLogo, alias: string, top: number) {
  const box = BIB_LAYOUT.logo;
  const scale = Math.min(box.w / logo.width, box.h / logo.height);
  const w = logo.width * scale;
  const h = logo.height * scale;
  doc.addImage(
    logo.data,
    "PNG",
    box.x + (box.w - w) / 2,
    top + box.y + (box.h - h) / 2,
    w,
    h,
    alias,
    "FAST",
  );
}

function drawCard(doc: jsPDF, card: BibCard, top: number, logos: BibLogo[]) {
  const L = BIB_LAYOUT;
  if (card.logoIndex !== null && logos[card.logoIndex]) {
    drawLogo(doc, logos[card.logoIndex], `partner-${card.logoIndex}`, top);
  }

  // Číslo
  const number = String(card.bib);
  doc.setFont(FONT, "bold");
  const numberSize = fitSize(doc, number, L.number.size, L.number.maxWidth);
  doc.setFontSize(numberSize);
  doc.setTextColor(...NUMBER_COLORS[card.color]);
  doc.text(number, L.number.x, top + L.number.baseline + (card.blank ? 3 : 0), {
    align: "center",
  });

  drawBarcode(doc, card.bib, L.barcode.x, top + L.barcode.y);

  if (card.blank) {
    // Rezerva: místo na ručně dopsané jméno a kategorii, start a nápis bez roku.
    const lineY = top + L.bar.y + 6;
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.line(12, lineY, 112, lineY);
    doc.line(120, lineY, 138, lineY);
    doc.setFont(FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("jméno", 12, lineY + 3.6);
    doc.text("kat.", 120, lineY + 3.6);
    const right = L.bar.x + L.bar.w;
    doc.setFontSize(15);
    doc.setFont(FONT, "bold");
    const timeWidth = doc.getTextWidth(card.startTime);
    doc.setTextColor(0, 0, 0);
    doc.text(card.startTime, right, lineY - 1, { align: "right" });
    doc.setFont(FONT, "normal");
    doc.text("start v", right - timeWidth - 2, lineY - 1, { align: "right" });
  } else {
    // Velké příjmení
    doc.setFont(FONT, "bold");
    doc.setTextColor(0, 0, 0);
    const surnameMax = card.veteranStarts !== null ? L.surname.maxWidth - 28 : L.surname.maxWidth;
    doc.setFontSize(fitSize(doc, card.surname, L.surname.size, surnameMax));
    doc.text(card.surname, PAGE_W / 2, top + L.surname.baseline, { align: "center" });

    // Počet startů veterána vpravo dole
    if (card.veteranStarts !== null) {
      doc.setFontSize(L.veteran.size);
      doc.setTextColor(...NUMBER_COLORS[card.color]);
      doc.text(String(card.veteranStarts), L.veteran.x, top + L.veteran.baseline, {
        align: "right",
      });
    }

    // Černý pruh: jméno + kategorie | start | id přihlášky
    const bar = L.bar;
    const y = top + bar.y;
    const left = bar.w * bar.split;
    doc.setFillColor(0, 0, 0);
    doc.rect(bar.x, y, bar.w, bar.h, "F");
    doc.setTextColor(255, 255, 255);
    const mid = y + bar.h / 2 + 1.9;
    const nameLine = `${card.fullName}`;
    const categoryText = `kat.: `;
    doc.setFont(FONT, "normal");
    doc.setFontSize(14);
    const categoryLabelWidth = doc.getTextWidth(categoryText);
    doc.setFont(FONT, "bold");
    const categoryWidth = categoryLabelWidth + doc.getTextWidth(card.category) + 6;
    const nameSize = fitSize(doc, nameLine, 14, left - categoryWidth - 6);
    doc.setFontSize(nameSize);
    doc.text(nameLine, bar.x + 3, mid);
    doc.setFontSize(14);
    doc.text(card.category, bar.x + left - 3, mid, { align: "right" });
    const categoryValueWidth = doc.getTextWidth(card.category);
    doc.setFont(FONT, "normal");
    doc.text(categoryText, bar.x + left - 3 - categoryValueWidth, mid, { align: "right" });

    const right = bar.x + bar.w;
    const idText = card.registrationId !== null ? `(${card.registrationId})` : "";
    doc.setFontSize(8.5);
    const idWidth = idText ? doc.getTextWidth(idText) + 3 : 0;
    if (idText) {
      doc.text(idText, right - 2, mid - 0.3, { align: "right" });
    }
    doc.setFontSize(14);
    const startLabel = "start v ";
    doc.setFont(FONT, "bold");
    const timeWidth = doc.getTextWidth(card.startTime);
    doc.setFont(FONT, "normal");
    const labelWidth = doc.getTextWidth(startLabel);
    const startCenter = bar.x + left + (bar.w - left - idWidth) / 2;
    const startX = startCenter - (labelWidth + timeWidth) / 2;
    doc.text(startLabel, startX, mid);
    doc.setFont(FONT, "bold");
    doc.text(card.startTime, startX + labelWidth, mid);
  }

  // Nápis MALÁ CENA VELKÉ VERANDY {rok}
  doc.setFont(FONT, "bold");
  doc.setTextColor(...card.titleColor);
  doc.setFontSize(fitSize(doc, card.title, L.title.size, L.title.maxWidth));
  doc.text(card.title, PAGE_W / 2, top + L.title.baseline, { align: "center" });
}

function cutMarks(doc: jsPDF) {
  doc.setDrawColor(170, 170, 170);
  doc.setLineWidth(0.2);
  doc.line(0, HALF_H, 6, HALF_H);
  doc.line(PAGE_W - 6, HALF_H, PAGE_W, HALF_H);
}

/** PDF startovních čísel: A4 na výšku, 2 čísla na stránku (#118). */
export function renderBibsPdf(
  cards: BibCard[],
  fonts: ReceiptFonts,
  logos: BibLogo[],
  meta: { title: string },
): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("DejaVuSans.ttf", fonts.regular);
  doc.addFont("DejaVuSans.ttf", FONT, "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
  doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold");
  doc.setProperties({ title: meta.title, subject: "Startovní čísla", creator: "www.mcvv.org" });

  if (cards.length === 0) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(14);
    doc.text("Žádná čísla k tisku.", 20, 30);
  }
  cards.forEach((card, index) => {
    if (index > 0 && index % 2 === 0) {
      doc.addPage();
    }
    if (index % 2 === 0) {
      cutMarks(doc);
    }
    drawCard(doc, card, (index % 2) * HALF_H, logos);
  });
  return new Uint8Array(doc.output("arraybuffer"));
}
