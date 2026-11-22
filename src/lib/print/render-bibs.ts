import { jsPDF } from "jspdf";

import type { BibFonts } from "./bib-fonts";
import { BIB_QR_RIGHT_PX, BIB_QR_SIZE_PX, BIB_QR_TOP_PX } from "./bib-qr";
import {
  SEAL_PRIMARY_TOP_PX,
  SEAL_RIGHT_PX,
  SEAL_SIZE_PX,
  SEAL_SMALL_PX,
  sealCacheKey,
} from "./bib-seals";
import { BIB_FOREST, bibGivenNameFirst, type BibCard, participationHex } from "./bibs-core";
import type { CoursePoint } from "./course-profile";

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

/** typografický střed čísla v oficiálním SVG. */
export const NUMBER_CENTER_PX = 1240;
/**
 * jsPDF getTextWidth/align u Oswald + letter-spacing -20 posune inkoust
 * trojčíslí o 21 px doleva vůči Chrome. Kompenzace, aby inkoust seděl na v15.
 */
export const NUMBER_INK_NUDGE_PX = 21;
/** typografický pravý okraj času (CSS right 100). */
export const TIME_RIGHT_PX = 2380;
/**
 * Stejný nesoulad jsPDF Tc u pravého zarovnání: jméno i levý okraj času
 * jsou na v15 o 31 px vlevo (měřeno na 173 @ 300 dpi).
 */
export const TIME_INK_NUDGE_PX = 31;
export const TIME_WIDTH_PAD_PX = 13;
export const SURNAME_MAX_PX = 1400;
export const SURNAME_SIZE_PX = 228;
export type BibLogo = { data: Uint8Array; width: number; height: number };

export type BibRenderAssets = {
  fonts: BibFonts;
  logos: BibLogo[];
  mcvvLogo: BibLogo;
  profile: readonly CoursePoint[];
  yearBadge: BibLogo;
  year: number;
  qrs?: ReadonlyMap<number, BibLogo>;
  seals?: ReadonlyMap<string, BibLogo>;
};

/** CSS/SVG skewX angle of the MCVV logo italic (top of the letters to the right). */
export const ITALIC_SKEW_DEG = -12;

/** Oficiální v15 / schválený testtisk: typografie a sazba spodního bloku (300 dpi). */
export const TIME_SIZE_PX = 176;
export const TIME_LABEL_SIZE_PX = 44;
export const TIME_NAME_SIZE_PX = 30;
export const TIME_BASELINE_PX = 1650;
export const NAME_BASELINE_PX = 1699;
export const TIME_GAP_PX = 18;
export const TIME_TRACKING_EM = 0.02;
export const TIME_LABEL_TRACKING_EM = 0.08;
export const TIME_NAME_TRACKING_EM = 0.1;
export const YEAR_LOGO_GAP_PX = 6;
export const YEAR_MARGIN_LEFT_PX = -110;
export const YEAR_MARGIN_TOP_PX = -20;
/** Musí odpovídat plátnu v bib-assets (oficiální v15 + rezerva na šikmou dvojku). */
export const YEAR_BADGE_W_PX = 720;
export const YEAR_BADGE_H_PX = 250;
export const YEAR_BADGE_EXTRA_LEFT_PX = 40;

/** Čárkovaná linka na rozstřižení 2×A5 na A4 (jako ve schváleném testtisku). */
export const CUT_LINE_COLOR = "#A7A7A7";
export const CUT_LINE_WIDTH_PX = 4;
export const CUT_LINE_DASH_PX = 24;
export const CUT_LINE_GAP_PX = 16;

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

function drawSeals(doc: jsPDF, card: BibCard, assets: BibRenderAssets, offsetYMm = 0) {
  if (card.blank || card.seals.length === 0 || !assets.seals) {
    return;
  }
  for (const seal of card.seals) {
    const image = assets.seals.get(sealCacheKey(seal));
    if (!image) {
      continue;
    }
    const sizePx = seal.placement === "secondary" ? SEAL_SMALL_PX : SEAL_SIZE_PX;
    const leftPx = 2480 - SEAL_RIGHT_PX - sizePx;
    const topPx =
      seal.placement === "primary" ? SEAL_PRIMARY_TOP_PX : BIB_QR_TOP_PX + BIB_QR_SIZE_PX + 8;
    drawContainedImage(doc, image, `seal-${sealCacheKey(seal)}`, {
      x: pxToMm(leftPx),
      y: pxToMm(topPx) + offsetYMm,
      w: pxToMm(sizePx),
      h: pxToMm(sizePx),
    });
  }
}

function drawCard(doc: jsPDF, card: BibCard, assets: BibRenderAssets, offsetYMm = 0) {
  const year = assets.year;
  const ym = (px: number) => pxToMm(px) + offsetYMm;
  const margin = pxToMm(100);

  // Logo partnera nahoře
  if (card.logoIndex !== null && assets.logos[card.logoIndex]) {
    // Oficiální .zone: left/right 100 (šířka 2280), img height 305, max-width 1900, centrované.
    drawContainedImage(doc, assets.logos[card.logoIndex], `partner-${card.logoIndex}`, {
      x: margin,
      y: ym(10) + (pxToMm(350) - pxToMm(305)) / 2,
      w: pxToMm(2280),
      h: pxToMm(305),
    });
  }

  // QR vpravo nahoře (375 px, oranžové rohy, logo V; payload MCVV{rok}-{číslo})
  const qr = assets.qrs?.get(card.bib);
  if (qr) {
    drawContainedImage(doc, qr, `qr-${year}-${card.bib}`, {
      x: pxToMm(2480 - BIB_QR_RIGHT_PX - BIB_QR_SIZE_PX),
      y: ym(BIB_QR_TOP_PX),
      w: pxToMm(BIB_QR_SIZE_PX),
      h: pxToMm(BIB_QR_SIZE_PX),
    });
  }

  const numberBaseline = ym(1172);
  drawSeals(doc, card, assets, offsetYMm);

  // Startovní číslo vzpřímené: černá / zelená / oranžová / zlatá
  const number = String(card.bib);
  doc.setFont(FONT, "bold");
  doc.setFontSize(pxToPt(990));
  doc.setCharSpace(pxToMm(-20));
  doc.setTextColor(participationHex(card.color));
  const numberWidth = doc.getTextWidth(number);
  doc.text(
    number,
    pxToMm(NUMBER_CENTER_PX + NUMBER_INK_NUDGE_PX) - numberWidth / 2,
    numberBaseline,
  );
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

  if (card.blank) {
    const lineY = ym(cssBaseline(1200, 40));
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
    const surnameBaseline = ym(cssBaseline(1200, surnameSize / PT /* px */));
    withSkewX(doc, ITALIC_SKEW_DEG, surnameBaseline, () => {
      doc.setFont(FONT, "bold");
      doc.setFontSize(surnameSize);
      doc.setTextColor(0, 0, 0);
      doc.text(card.surname, pxToMm(1240), surnameBaseline, { align: "center" });
    });
  }

  // Spodní řádek pod černou linkou
  const ruleY = ym(1442);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(pxToMm(4));
  doc.line(margin, ruleY, pxToMm(2380), ruleY);

  const bottomMid = (ym(1442 + 4 + 22) + ym(1748 - 22)) / 2;
  const logoW = pxToMm(720);
  const logoH = logoW * (assets.mcvvLogo.height / assets.mcvvLogo.width);
  const logoX = margin;
  const logoY = bottomMid - logoH / 2;
  drawContainedImage(doc, assets.mcvvLogo, "mcvv-logo", { x: logoX, y: logoY, w: logoW, h: logoH });

  const yearW = pxToMm(YEAR_BADGE_W_PX);
  const yearH = pxToMm(YEAR_BADGE_H_PX);
  const yearX =
    logoX + logoW + pxToMm(YEAR_LOGO_GAP_PX + YEAR_MARGIN_LEFT_PX - YEAR_BADGE_EXTRA_LEFT_PX);
  const yearY = bottomMid - pxToMm(YEAR_BADGE_H_PX) / 2 + pxToMm(YEAR_MARGIN_TOP_PX);
  doc.addImage(assets.yearBadge.data, "PNG", yearX, yearY, yearW, yearH, "year-badge", "FAST");

  // START V + čas vpravo, pod tím celé jméno a ročník (sazba v15)
  const timeBaseline = ym(TIME_BASELINE_PX);
  const timeX = pxToMm(TIME_RIGHT_PX - TIME_INK_NUDGE_PX);
  const timeTracking = pxToMm(TIME_SIZE_PX * TIME_TRACKING_EM);
  const labelTracking = pxToMm(TIME_LABEL_SIZE_PX * TIME_LABEL_TRACKING_EM);
  const nameTracking = pxToMm(TIME_NAME_SIZE_PX * TIME_NAME_TRACKING_EM);
  // jsPDF align:right + setCharSpace posune inkoust za pravý okraj
  // (šířka pro align nebere Tc stejně jako kresba). Kreslíme zleva od
  // (pravý okraj − getTextWidth), typografický pravý okraj zůstává 2380.
  doc.setFont(FONT, "bold");
  doc.setFontSize(pxToPt(TIME_SIZE_PX));
  doc.setCharSpace(timeTracking);
  const timeWidth = doc.getTextWidth(card.startTime);
  // getTextWidth + Tc je u času o ~13 px užší než Chrome (v15 inkoust 844 px).
  // Necháme levý okraj a jméno, tracking do kresby přidáme, aby narostl doprava.
  const timeGaps = Math.max(card.startTime.length - 1, 1);
  const timeStart = timeX - timeWidth;
  doc.setCharSpace(timeTracking + pxToMm(TIME_WIDTH_PAD_PX) / timeGaps);
  doc.setTextColor(BIB_FOREST);
  doc.text(card.startTime, timeStart, timeBaseline);
  doc.setFont(FONT, "medium");
  doc.setFontSize(pxToPt(TIME_LABEL_SIZE_PX));
  doc.setCharSpace(labelTracking);
  const labelWidth = doc.getTextWidth("START V:");
  doc.text("START V:", timeX - timeWidth - pxToMm(TIME_GAP_PX) - labelWidth, timeBaseline);
  doc.setCharSpace(0);

  if (!card.blank) {
    const whoName = bibGivenNameFirst(card.fullName);
    const who = card.birthYear ? `${whoName} · ${card.birthYear}` : whoName;
    doc.setFont(FONT, "normal");
    doc.setFontSize(pxToPt(TIME_NAME_SIZE_PX));
    doc.setCharSpace(nameTracking);
    doc.setTextColor(0, 0, 0);
    const whoWidth = doc.getTextWidth(who);
    doc.text(who, timeX - whoWidth, ym(NAME_BASELINE_PX));
    doc.setCharSpace(0);
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

/** Náhled A4 na výšku, dvě A5 čísla pod sebou (tisková zkouška). Ostrý tisk zůstává 1× A5. */
export function renderBibsPreviewA4(
  cards: BibCard[],
  assets: BibRenderAssets,
  meta: { title: string },
): Uint8Array {
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
    compress: true,
  });
  registerFonts(doc, assets.fonts);
  doc.setProperties({
    title: meta.title,
    subject: "Náhled startovních čísel 2×A5",
    creator: "www.mcvv.org",
  });
  if (cards.length === 0) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(14);
    doc.setTextColor(BIB_FOREST);
    doc.text("Žádná čísla k tisku.", 20, 30);
  }
  cards.forEach((card, index) => {
    if (index > 0 && index % 2 === 0) {
      drawA4CutLine(doc);
      doc.addPage();
    }
    drawCard(doc, card, assets, (index % 2) * BIB_PAGE_H_MM);
  });
  if (cards.length > 0) {
    drawA4CutLine(doc);
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

function drawA4CutLine(doc: jsPDF) {
  const y = BIB_PAGE_H_MM;
  doc.setDrawColor(CUT_LINE_COLOR);
  doc.setLineWidth(pxToMm(CUT_LINE_WIDTH_PX));
  doc.setLineCap("butt");
  doc.setLineDashPattern([pxToMm(CUT_LINE_DASH_PX), pxToMm(CUT_LINE_GAP_PX)], 0);
  doc.line(0, y, BIB_PAGE_W_MM, y);
  doc.setLineDashPattern([], 0);
}
