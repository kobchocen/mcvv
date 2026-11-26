import { jsPDF } from "jspdf";
import { autoTable, type UserOptions } from "jspdf-autotable";

import {
  drawOfficialLogo,
  loadOfficialLogoPng,
  officialLogoPrintWidthMm,
  officialLogoSize,
} from "@/lib/print/official-logo";

import type { ReceiptFonts } from "./fonts";
import type { ReceiptTranslate } from "./labels";
import {
  formatAmount,
  formatCalendarDate,
  formatPragueDate,
  type ReceiptDocument,
  type ReceiptLocale,
} from "./receipt-core";

const FONT = "DejaVu";
const MARGIN = 18;
const INK: [number, number, number] = [15, 42, 28];
const MUTED: [number, number, number] = [93, 109, 99];
const ACCENT: [number, number, number] = [226, 83, 28];
const PAPER: [number, number, number] = [247, 249, 246];
const SITE = "www.mcvv.org";

const alignRight = (content: string) => ({ content, styles: { halign: "right" as const } });

function lastTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0;
}

/**
 * PDF dokladu o zaplacení (A4). Vzhled vychází z legacy „Vyúčtování vkladů“
 * bez razítka a podpisu; vystaveno elektronicky.
 */
export function renderReceiptPdf(
  receipt: ReceiptDocument,
  locale: ReceiptLocale,
  t: ReceiptTranslate,
  fonts: ReceiptFonts,
): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("DejaVuSans.ttf", fonts.regular);
  doc.addFont("DejaVuSans.ttf", FONT, "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
  doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold");
  doc.setProperties({
    title: `${t("title")} ${receipt.number}`,
    subject: t("title"),
    author: receipt.issuer.name,
    creator: SITE,
  });

  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const right = width - MARGIN;
  const amount = (value: number) => formatAmount(value, locale);
  const day = (value: Date) => formatCalendarDate(value, locale);
  const text = (
    value: string | string[],
    x: number,
    y: number,
    options: { size?: number; bold?: boolean; color?: [number, number, number] } = {},
    align?: "right" | "center",
  ) => {
    doc.setFont(FONT, options.bold ? "bold" : "normal");
    doc.setFontSize(options.size ?? 10.5);
    doc.setTextColor(...(options.color ?? [0, 0, 0]));
    doc.text(value, x, y, align ? { align } : undefined);
  };

  // Hlavička: oficiální logo na světlém podkladu, vedle název dokladu.
  const logo = loadOfficialLogoPng("light");
  const logoW = officialLogoPrintWidthMm();
  const logoH = officialLogoSize(logoW).height;
  const logoY = 12;
  drawOfficialLogo(doc, logo, MARGIN, logoY, logoW, "mcvv-logo-light");
  const titleX = MARGIN + logoW + 4;
  const numberLabel = t("number", { number: receipt.number });
  const dateLabel = t("issueDate", { date: day(receipt.issueDate) });
  text(numberLabel, right, logoY + 7, { size: 12, bold: true }, "right");
  text(dateLabel, right, logoY + 13.5, { size: 9.5 }, "right");
  doc.setFont(FONT, "bold");
  doc.setFontSize(12);
  const numberW = doc.getTextWidth(numberLabel);
  doc.setFont(FONT, "normal");
  doc.setFontSize(9.5);
  const reserved = Math.max(numberW, doc.getTextWidth(dateLabel)) + 8;
  let titleSize = 15;
  const titleText = t("title");
  doc.setFont(FONT, "bold");
  doc.setFontSize(titleSize);
  const titleMax = Math.max(40, right - reserved - titleX);
  while (titleSize > 11 && doc.getTextWidth(titleText) > titleMax) {
    titleSize -= 0.5;
    doc.setFontSize(titleSize);
  }
  const titleLines = doc.splitTextToSize(titleText, titleMax) as string[];
  text(titleLines, titleX, logoY + 7, { size: titleSize, bold: true, color: INK });
  const subtitleY = logoY + 7 + Math.max(1, titleLines.length) * (titleSize * 0.4) + 1.5;
  text(t("subtitle", { year: receipt.year }), titleX, subtitleY, { size: 9.5, color: MUTED });
  const ruleY = Math.max(logoY + logoH + 4, subtitleY + 5);
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, ruleY, right, ruleY);

  // Příjemce / plátce
  const column = (width - 2 * MARGIN) / 2 - 4;
  const payerTop = ruleY + 8;
  const block = (x: number, title: string, lines: string[]) => {
    text(title.toUpperCase(), x, payerTop, { size: 8.5, bold: true, color: MUTED });
    let y = payerTop + 6;
    lines.forEach((line, index) => {
      doc.setFont(FONT, index === 0 ? "bold" : "normal");
      doc.setFontSize(10.5);
      const wrapped = doc.splitTextToSize(line, column) as string[];
      text(wrapped, x, y, { bold: index === 0 });
      y += wrapped.length * 5;
    });
    return y;
  };
  const issuerEnd = block(MARGIN, t("issuer"), [
    receipt.issuer.name,
    ...receipt.issuer.address.split("\n"),
    t("ico", { ico: receipt.issuer.ico }),
    receipt.issuer.vatNote,
  ]);
  const payerEnd = block(
    width / 2 + 4,
    t("payer"),
    [receipt.payerName, receipt.payerEmail].filter(Boolean),
  );

  // Účel platby
  let y = Math.max(issuerEnd, payerEnd) + 5;
  text(t("purpose").toUpperCase(), MARGIN, y, { size: 8.5, bold: true, color: MUTED });
  const purpose = doc.splitTextToSize(
    t("purposeText", {
      year: receipt.year,
      date: formatPragueDate(receipt.raceDate, locale),
    }),
    width - 2 * MARGIN,
  ) as string[];
  text(purpose, MARGIN, y + 6);
  y += 6 + purpose.length * 5;
  text(
    t("purposeRef", {
      year: receipt.year,
      id: receipt.registrationId,
      vs: receipt.variableSymbol,
    }),
    MARGIN,
    y,
  );
  y += 7;

  const table: Partial<UserOptions> = {
    theme: "striped",
    margin: { left: MARGIN, right: MARGIN, bottom: 22 },
    styles: { font: FONT, fontSize: 9.5, cellPadding: 1.8, textColor: [20, 20, 20] },
    headStyles: { font: FONT, fontStyle: "bold", fillColor: INK, textColor: 255 },
    footStyles: { font: FONT, fontStyle: "bold", fillColor: PAPER, textColor: 0 },
    showFoot: "lastPage",
  };

  autoTable(doc, {
    ...table,
    startY: y,
    head: [
      [t("colRunner"), t("colBirth"), t("colClub"), t("colCategory"), alignRight(t("colFee"))],
    ],
    body: receipt.lines.map((line) => [
      line.runner,
      line.birthYear,
      line.club,
      line.category,
      amount(line.fee),
    ]),
    foot: [
      [
        t("linesTotal", { count: receipt.lines.length }),
        "",
        "",
        "",
        alignRight(amount(receipt.fee)),
      ],
    ],
    columnStyles: { 4: { halign: "right" } },
  });

  autoTable(doc, {
    ...table,
    startY: lastTableY(doc) + 6,
    head: [[t("colPaymentDate"), t("colMethod"), t("colVs"), alignRight(t("colAmount"))]],
    body: receipt.payments.map((payment) => [
      day(payment.date),
      payment.method === "bank" ? t("methodBank") : t("methodOrganizer"),
      payment.method === "bank" ? receipt.variableSymbol : "—",
      amount(payment.amount),
    ]),
    foot: [[t("paymentsTotal"), "", "", alignRight(amount(receipt.paid))]],
    columnStyles: { 3: { halign: "right" } },
  });

  // Souhrn
  const rows: [string, string, boolean][] = [
    [t("sumFee"), amount(receipt.fee), false],
    [t("sumPaid"), amount(receipt.paid), true],
  ];
  if (receipt.overpaid > 0) {
    rows.push([t("overpaid"), amount(receipt.overpaid), false]);
  }
  const boxHeight = rows.length * 6 + 4;
  y = lastTableY(doc) + 8;
  if (y + boxHeight + 22 > height - 22) {
    doc.addPage();
    y = 24;
  }
  const boxWidth = 88;
  const boxX = right - boxWidth;
  doc.setFillColor(...PAPER);
  doc.rect(boxX, y, boxWidth, boxHeight, "F");
  rows.forEach(([label, value, bold], index) => {
    const rowY = y + 6 + index * 6;
    text(label, boxX + 3, rowY, { bold });
    text(value, right - 3, rowY, { bold }, "right");
  });
  text(t("paidStamp"), MARGIN, y + 8, { size: 13, bold: true, color: [0, 110, 50] });
  text(t("received", { amount: amount(receipt.paid) }), MARGIN, y + 14, { size: 9.5 });

  y += boxHeight + 14;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, MARGIN + 110, y);
  text(
    t("issuedBy", { date: day(receipt.issueDate), issuer: receipt.issuer.name }),
    MARGIN,
    y + 5,
    { size: 9.5 },
  );

  // Patička na každé stránce
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    text(t("footer", { site: SITE }), MARGIN, height - 13, { size: 8, color: [110, 110, 110] });
    text(t("page", { page, pages }), MARGIN, height - 8, { size: 8, color: [110, 110, 110] });
    text(
      `${receipt.number} · ${t("generated", {
        date: formatPragueDate(receipt.generatedAt, locale, true),
      })}`,
      right,
      height - 8,
      { size: 8, color: [110, 110, 110] },
      "right",
    );
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
