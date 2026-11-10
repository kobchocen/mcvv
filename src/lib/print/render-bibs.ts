import { jsPDF } from "jspdf";

import type { BibFonts } from "./bib-fonts";
import { bibQrMatrix } from "./bib-qr";
import {
  BIB_FOREST,
  BIB_ORANGE,
  bibGivenNameFirst,
  type BibCard,
  type BibColor,
  participationHex,
} from "./bibs-core";
import { profilePoints, type CoursePoint } from "./course-profile";

const FONT = "Oswald";

/** A5 na šířku, 300 dpi = 2480 × 1748 px. */
export const BIB_PAGE_W_MM = 210;
export const BIB_PAGE_H_MM = 148;
export const BIB_PX_W = 2480;
export const BIB_PX_H = 1748;
const MM = BIB_PAGE_W_MM / BIB_PX_W;
const PT = 72 / 300;

export const pxToMm = (value: number) => value * MM;
export const pxToPt = (value: number) => value * PT;

/** Oswald typo metriky (unitsPerEm 1000) pro převod CSS `top` na baseline. */
const OSWALD_ASCEND = 1.193;
const OSWALD_DESCEND = 0.289;

export function cssBaseline(topPx: number, fontSizePx: number, lineHeight = 1): number {
  const halfLeading = (lineHeight - (OSWALD_ASCEND + OSWALD_DESCEND)) / 2;
  return topPx + (halfLeading + OSWALD_ASCEND) * fontSizePx;
}

export const SURNAME_MAX_PX = 1400;
export const SURNAME_SIZE_PX = 228;
/**
 * Pravý ink odznaku má mít alespoň 60 px rezervu (jako „35“ ve v12).
 * BADGE_RIGHT_PX je pravý okraj cesty, zmenšený o polovinu tloušťky obrysu.
 */
export const BADGE_MARGIN_PX = 60;
const BADGE_STROKE_PX = 5;
export const BADGE_RIGHT_PX = 2480 - BADGE_MARGIN_PX - Math.ceil(BADGE_STROKE_PX / 2);
export const BADGE_NUMBER_SIZE_PX = 128;
export const BADGE_LABEL_SIZE_PX = 26;
export const BADGE_LABEL = "ÚČASTÍ";
const BADGE_PAD_X_PX = 34;
const BADGE_PAD_Y_PX = 20;
const BADGE_GAP_PX = 6;
const BADGE_RADIUS_PX = 28;
/** Svislý střed odznaku – vedle těla startovního čísla, pod QR (spodek QR = 610). */
const BADGE_CENTER_Y_PX = 880;

export type BibLogo = { data: Uint8Array; width: number; height: number };

export type BibRenderAssets = {
  fonts: BibFonts;
  logos: BibLogo[];
  mcvvLogo: BibLogo;
  profile: readonly CoursePoint[];
  yearBadge: BibLogo;
  year: number;
};

const NUMBER_COLORS: Record<BibColor, string> = {
  black: "#000000",
  forest: BIB_FOREST,
  orange: BIB_ORANGE,
};

/** CSS/SVG skewX angle of the MCVV logo italic (top of the letters to the right). */
export const ITALIC_SKEW_DEG = -12;

function registerFonts(doc: jsPDF, fonts: BibFonts) {
  doc.addFileToVFS("Oswald-Regular.ttf", fonts.regular);
  doc.addFont("Oswald-Regular.ttf", FONT, "normal");
  doc.addFileToVFS("Oswald-Medium.ttf", fonts.medium);
  doc.addFont("Oswald-Medium.ttf", FONT, "medium");
  doc.addFileToVFS("Oswald-SemiBold.ttf", fonts.semibold);
  doc.addFont("Oswald-SemiBold.ttf", FONT, "semibold");
  doc.addFileToVFS("Oswald-Bold.ttf", fonts.bold);
  doc.addFont("Oswald-Bold.ttf", FONT, "bold");
}

/** Velikost písma (pt), aby text nepřesáhl šířku (mm). */
export function fitSize(doc: jsPDF, text: string, sizePt: number, maxWidthMm: number): number {
  doc.setFontSize(sizePt);
  const width = doc.getTextWidth(text);
  return width > maxWidthMm ? (sizePt * maxWidthMm) / width : sizePt;
}

function drawPolyline(
  doc: jsPDF,
  points: { x: number; y: number }[],
  widthMm: number,
  color: string,
) {
  if (points.length < 2) {
    return;
  }
  doc.setDrawColor(color);
  doc.setLineWidth(widthMm);
  doc.setLineJoin("round");
  doc.setLineCap("round");
  doc.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    doc.lineTo(points[i].x, points[i].y);
  }
  doc.stroke();
}

/**
 * Matice skewX pro nativní PDF prostor (body, y nahoru).
 * `degrees` je CSS/SVG úhel: záporný = typografická kurzíva (vršek doprava).
 * `originYMm` je baseline v souřadnicích jsPDF (mm od horního okraje).
 */
export function pdfSkewXMatrix(
  degrees: number,
  originYMm: number,
  pageHeightMm: number,
  ptPerMm = 72 / 25.4,
): { a: number; b: number; c: number; d: number; e: number; f: number } {
  const originYPt = (pageHeightMm - originYMm) * ptPerMm;
  // V PDF (y nahoru) má stejný vizuální sklon opačné znaménko než CSS skewX.
  const c = -Math.tan((degrees * Math.PI) / 180);
  return { a: 1, b: 0, c, d: 1, e: -c * originYPt, f: 0 };
}

function withSkewX(doc: jsPDF, degrees: number, originYMm: number, draw: () => void) {
  const m = pdfSkewXMatrix(
    degrees,
    originYMm,
    doc.internal.pageSize.getHeight(),
    doc.internal.scaleFactor,
  );
  doc.saveGraphicsState();
  doc.setCurrentTransformationMatrix(doc.Matrix(m.a, m.b, m.c, m.d, m.e, m.f));
  draw();
  doc.restoreGraphicsState();
}

function drawQr(doc: jsPDF, year: number, bib: number, xMm: number, yMm: number, sizeMm: number) {
  const matrix = bibQrMatrix(year, bib);
  const quiet = 2;
  const cells = matrix.size + quiet * 2;
  const cell = sizeMm / cells;
  doc.setFillColor(255, 255, 255);
  doc.rect(xMm, yMm, sizeMm, sizeMm, "F");
  doc.setFillColor(0, 0, 0);
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.darkAt(row, col)) {
        doc.rect(xMm + (col + quiet) * cell, yMm + (row + quiet) * cell, cell, cell, "F");
      }
    }
  }
}

function drawContainedImage(
  doc: jsPDF,
  logo: BibLogo,
  alias: string,
  box: { x: number; y: number; w: number; h: number },
) {
  const scale = Math.min(box.w / logo.width, box.h / logo.height);
  const w = logo.width * scale;
  const h = logo.height * scale;
  doc.addImage(
    logo.data,
    "PNG",
    box.x + (box.w - w) / 2,
    box.y + (box.h - h) / 2,
    w,
    h,
    alias,
    "FAST",
  );
}

function drawParticipationBadge(doc: jsPDF, count: number, hex: string) {
  const label = BADGE_LABEL;
  const numberText = String(count);
  doc.setFont(FONT, "bold");
  doc.setFontSize(pxToPt(BADGE_NUMBER_SIZE_PX));
  doc.setCharSpace(0);
  const numberWidthPx = doc.getTextWidth(numberText) / MM;
  const italicOverhangPx =
    Math.tan((-ITALIC_SKEW_DEG * Math.PI) / 180) * OSWALD_ASCEND * BADGE_NUMBER_SIZE_PX;
  doc.setFontSize(pxToPt(BADGE_LABEL_SIZE_PX));
  const labelWidthPx = doc.getTextWidth(label) / MM;
  const innerWidthPx = Math.max(numberWidthPx + italicOverhangPx, labelWidthPx);
  const widthPx = innerWidthPx + 2 * BADGE_PAD_X_PX;
  const heightPx =
    BADGE_PAD_Y_PX +
    OSWALD_ASCEND * BADGE_NUMBER_SIZE_PX +
    BADGE_GAP_PX +
    (OSWALD_ASCEND + OSWALD_DESCEND) * BADGE_LABEL_SIZE_PX +
    BADGE_PAD_Y_PX;
  const leftPx = BADGE_RIGHT_PX - widthPx;
  const topPx = BADGE_CENTER_Y_PX - heightPx / 2;
  const numberBaselinePx = topPx + BADGE_PAD_Y_PX + OSWALD_ASCEND * BADGE_NUMBER_SIZE_PX;
  const labelBaselinePx = numberBaselinePx + BADGE_GAP_PX + OSWALD_ASCEND * BADGE_LABEL_SIZE_PX;
  const centerXPx = leftPx + widthPx / 2;

  doc.setDrawColor(hex);
  doc.setLineWidth(pxToMm(BADGE_STROKE_PX));
  doc.setLineJoin("round");
  doc.setLineCap("round");
  doc.roundedRect(
    pxToMm(leftPx),
    pxToMm(topPx),
    pxToMm(widthPx),
    pxToMm(heightPx),
    pxToMm(BADGE_RADIUS_PX),
    pxToMm(BADGE_RADIUS_PX),
    "S",
  );

  const numberBaseline = pxToMm(numberBaselinePx);
  withSkewX(doc, ITALIC_SKEW_DEG, numberBaseline, () => {
    doc.setFont(FONT, "bold");
    doc.setFontSize(pxToPt(BADGE_NUMBER_SIZE_PX));
    doc.setTextColor(hex);
    doc.setCharSpace(0);
    doc.text(numberText, pxToMm(centerXPx), numberBaseline, { align: "center" });
  });

  doc.setFont(FONT, "semibold");
  doc.setFontSize(pxToPt(BADGE_LABEL_SIZE_PX));
  doc.setTextColor(hex);
  doc.setCharSpace(pxToMm(2));
  doc.text(label, pxToMm(centerXPx), pxToMm(labelBaselinePx), { align: "center" });
  doc.setCharSpace(0);
}

function drawCard(doc: jsPDF, card: BibCard, assets: BibRenderAssets) {
  const year = assets.year;
  const margin = pxToMm(100);

  // Logo partnera nahoře
  if (card.logoIndex !== null && assets.logos[card.logoIndex]) {
    drawContainedImage(doc, assets.logos[card.logoIndex], `partner-${card.logoIndex}`, {
      x: margin,
      y: pxToMm(10) + (pxToMm(350) - pxToMm(305)) / 2,
      w: pxToMm(1900),
      h: pxToMm(305),
    });
  }

  // QR vpravo nahoře (místo čárového kódu)
  drawQr(doc, year, card.bib, pxToMm(2480 - 100 - 230), pxToMm(380), pxToMm(230));

  const numberBaseline = pxToMm(1172);

  // Počet účastí jako obrysový odznak vpravo vedle čísla (pod QR)
  if (!card.blank && card.veteranStarts !== null) {
    const hex = participationHex(card.color) ?? NUMBER_COLORS.forest;
    drawParticipationBadge(doc, card.veteranStarts, hex);
  }

  // Startovní číslo vzpřímené; barva jako počet účastí (veterán forest, obhájce oranžová)
  const number = String(card.bib);
  doc.setFont(FONT, "bold");
  doc.setFontSize(pxToPt(990));
  doc.setCharSpace(pxToMm(-20));
  doc.setTextColor(NUMBER_COLORS[card.color]);
  doc.text(number, pxToMm(1240), numberBaseline, { align: "center" });
  doc.setCharSpace(0);

  // Kategorie slovy, 90° proti směru hodin
  if (!card.blank && card.category) {
    doc.setFont(FONT, "semibold");
    doc.setFontSize(pxToPt(78));
    doc.setCharSpace(pxToMm(8));
    doc.setTextColor(BIB_FOREST);
    doc.text(card.category, pxToMm(190), numberBaseline, { angle: 90, align: "left" });
    doc.setCharSpace(0);
  }

  // Bílá vlnitá linka profilu tratě přes číslo
  const top = 372;
  const base = 1172;
  const height = base - top;
  const line = profilePoints(
    assets.profile,
    30,
    pxToMm(top + 0.5 * height),
    pxToMm(top + 0.7 * height),
    pxToMm(590),
    pxToMm(1890),
    5,
  );
  drawPolyline(doc, line, pxToMm(26), "#ffffff");

  if (card.blank) {
    const lineY = pxToMm(cssBaseline(1200, 40));
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.line(margin, lineY, pxToMm(1400), lineY);
    doc.setFont(FONT, "normal");
    doc.setFontSize(pxToPt(26));
    doc.setTextColor(120, 120, 120);
    doc.text("jméno", margin, lineY + pxToMm(28));
  } else {
    // Příjmení pod číslem, kurzívou, centrované; dlouhá jména se zmenší
    const surnameSize = fitSize(doc, card.surname, pxToPt(SURNAME_SIZE_PX), pxToMm(SURNAME_MAX_PX));
    const surnameBaseline = pxToMm(cssBaseline(1200, surnameSize / PT /* px */));
    withSkewX(doc, ITALIC_SKEW_DEG, surnameBaseline, () => {
      doc.setFont(FONT, "bold");
      doc.setFontSize(surnameSize);
      doc.setTextColor(0, 0, 0);
      doc.text(card.surname, pxToMm(1240), surnameBaseline, { align: "center" });
    });
  }

  // Spodní řádek pod černou linkou
  const ruleY = pxToMm(1442);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(pxToMm(4));
  doc.line(margin, ruleY, pxToMm(2380), ruleY);

  const bottomMid = (pxToMm(1442 + 4 + 22) + pxToMm(1748 - 22)) / 2;
  const logoW = pxToMm(720);
  const logoH = logoW * (assets.mcvvLogo.height / assets.mcvvLogo.width);
  const logoX = margin;
  const logoY = bottomMid - logoH / 2;
  drawContainedImage(doc, assets.mcvvLogo, "mcvv-logo", { x: logoX, y: logoY, w: logoW, h: logoH });

  const yearW = pxToMm(550);
  const yearH = pxToMm(290);
  const yearX = logoX + logoW + pxToMm(6) + pxToMm(-45) - pxToMm(50);
  const yearY = bottomMid - pxToMm(250) / 2 + pxToMm(-40) - pxToMm(20);
  doc.addImage(assets.yearBadge.data, "PNG", yearX, yearY, yearW, yearH, "year-badge", "FAST");

  // START V + čas vpravo, pod tím celé jméno a ročník
  const timeBaseline = bottomMid + pxToMm(20);
  doc.setFont(FONT, "medium");
  doc.setFontSize(pxToPt(34));
  doc.setTextColor(BIB_FOREST);
  const timeWidth = (() => {
    doc.setFont(FONT, "bold");
    doc.setFontSize(pxToPt(128));
    return doc.getTextWidth(card.startTime);
  })();
  const timeX = pxToMm(2380);
  doc.setFont(FONT, "bold");
  doc.setFontSize(pxToPt(128));
  doc.setTextColor(BIB_FOREST);
  doc.text(card.startTime, timeX, timeBaseline, { align: "right" });
  doc.setFont(FONT, "medium");
  doc.setFontSize(pxToPt(34));
  doc.text("START V:", timeX - timeWidth - pxToMm(18), timeBaseline, { align: "right" });

  if (!card.blank) {
    const whoName = bibGivenNameFirst(card.fullName);
    const who = card.birthYear ? `${whoName} · ${card.birthYear}` : whoName;
    doc.setFont(FONT, "normal");
    doc.setFontSize(pxToPt(26));
    doc.setTextColor(0, 0, 0);
    doc.text(who, timeX, timeBaseline + pxToMm(32), { align: "right" });
  }
}

/** PDF startovních čísel: A5 na šířku, jedno číslo na stránku, 300 dpi rozvržení. */
export function renderBibsPdf(
  cards: BibCard[],
  assets: BibRenderAssets,
  meta: { title: string },
): Uint8Array {
  const doc = new jsPDF({
    unit: "mm",
    format: "a5",
    orientation: "landscape",
    compress: true,
  });
  registerFonts(doc, assets.fonts);
  doc.setProperties({ title: meta.title, subject: "Startovní čísla", creator: "www.mcvv.org" });

  if (cards.length === 0) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(14);
    doc.setTextColor(BIB_FOREST);
    doc.text("Žádná čísla k tisku.", 20, 30);
    doc.setFontSize(10);
    doc.text("Ve startovce zatím nejsou žádná přidělená startovní čísla.", 20, 40);
  }
  cards.forEach((card, index) => {
    if (index > 0) {
      doc.addPage();
    }
    drawCard(doc, card, assets);
  });
  return new Uint8Array(doc.output("arraybuffer"));
}
