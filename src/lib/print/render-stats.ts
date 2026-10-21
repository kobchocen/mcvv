import { jsPDF } from "jspdf";

import type { ReceiptFonts } from "@/lib/receipts/fonts";
import type { StatsChartBar, StatsTableData } from "@/lib/stats/tables";

import { CELL_PAD, COLUMN_GAP, layoutStats, PT_TO_MM, type StatsLayout } from "./stats-layout";

const FONT = "DejaVu";
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - 2 * MARGIN;

/** Jednotná grafika tiskových sestav MCVV (stejné barvy jako PDF doklad). */
export const PRINT_COLORS = {
  ink: [15, 42, 28] as [number, number, number],
  accent: [177, 61, 12] as [number, number, number],
  muted: [93, 109, 99] as [number, number, number],
  paper: [244, 247, 243] as [number, number, number],
  line: [205, 216, 207] as [number, number, number],
  women: [150, 168, 156] as [number, number, number],
};

export type StatsReport = {
  slug: string;
  title: string;
  intro: string;
  /** Např. „Statistiky · 1993–2025“. */
  eyebrow: string;
  tables: StatsTableData[];
  chart?: StatsChartBar[];
  chartCaption?: string;
  menLabel: string;
  womenLabel: string;
  emptyText: string;
  generatedAt: Date;
};

function pragueStamp(date: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function truncate(doc: jsPDF, text: string, width: number): string {
  // tolerance: šířky sloupců se počítají ze stejného měření (zaokrouhlení float)
  if (doc.getTextWidth(text) <= width + 0.05) {
    return text;
  }
  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > width) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

/** Ikona webu (viewBox 64×64) překreslená vektorově. */
export function drawBrandMark(doc: jsPDF, x: number, y: number, size: number) {
  const k = size / 64;
  doc.setFillColor(...PRINT_COLORS.accent);
  doc.roundedRect(x, y, size, size, 16 * k, 16 * k, "F");
  const points: [number, number][] = [
    [27.76, 50],
    [21.27, 14],
    [28.07, 14],
    [31.93, 38.44],
    [35.53, 14],
    [42.73, 14],
    [36.16, 50],
  ];
  const deltas = points.slice(1).map(([px, py], index) => {
    const [qx, qy] = points[index];
    return [(px - qx) * k, (py - qy) * k];
  });
  doc.setFillColor(255, 255, 255);
  doc.lines(deltas, x + points[0][0] * k, y + points[0][1] * k, [1, 1], "F", true);
}

/** Hlavička: tmavý pruh se značkou MCVV, nadpis, oranžová linka. */
function drawHeader(doc: jsPDF, report: StatsReport): number {
  const { ink, accent } = PRINT_COLORS;
  doc.setFillColor(...ink);
  doc.rect(0, 0, PAGE_W, 34, "F");
  doc.setFillColor(...accent);
  doc.rect(0, 34, PAGE_W, 1.4, "F");

  // Značka MCVV (src/app/icon.svg: zaoblený čtverec #b13d0c s bílým „V“) + MALÁ CENA / VELKÉ VERANDY
  drawBrandMark(doc, MARGIN, 9, 15);
  doc.setFont(FONT, "bold");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9.5);
  doc.text("MALÁ CENA", MARGIN + 19, 15.3);
  doc.text("VELKÉ VERANDY", MARGIN + 19, 20.6);
  doc.setFont(FONT, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(190, 205, 195);
  doc.text("www.mcvv.org", MARGIN + 19, 25.4);

  // Nadpis vpravo
  const right = PAGE_W - MARGIN;
  doc.setFont(FONT, "bold");
  doc.setFontSize(8);
  doc.setTextColor(...accent);
  doc.text(report.eyebrow.toUpperCase(), right, 13, { align: "right" });
  doc.setTextColor(255, 255, 255);
  let size = 22;
  doc.setFontSize(size);
  const maxTitle = CONTENT_W - 62;
  if (doc.getTextWidth(report.title) > maxTitle) {
    size = (size * maxTitle) / doc.getTextWidth(report.title);
    doc.setFontSize(size);
  }
  doc.text(report.title, right, 24.5, { align: "right" });

  // Úvod
  let y = 43;
  if (report.intro) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...PRINT_COLORS.muted);
    const lines = (doc.splitTextToSize(report.intro, CONTENT_W) as string[]).slice(0, 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4 + 2;
  }
  return y;
}

function drawFooter(doc: jsPDF, report: StatsReport, note: string | null) {
  const y = PAGE_H - 10;
  doc.setDrawColor(...PRINT_COLORS.line);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y - 4.5, PAGE_W - MARGIN, y - 4.5);
  doc.setFont(FONT, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...PRINT_COLORS.muted);
  doc.text(`www.mcvv.org/statistiky/${report.slug}`, MARGIN, y);
  doc.text(`Vygenerováno ${pragueStamp(report.generatedAt)}`, PAGE_W - MARGIN, y, {
    align: "right",
  });
  if (note) {
    doc.text(note, PAGE_W / 2, y, { align: "center" });
  }
}

/** Skládaný sloupcový graf účasti (muži dole, ženy nahoře) s osou let. */
function drawChart(doc: jsPDF, report: StatsReport, top: number, height: number): number {
  const bars = report.chart ?? [];
  if (bars.length === 0) {
    return top;
  }
  const { accent, women, muted, line, ink } = PRINT_COLORS;
  let y = top;
  if (report.chartCaption) {
    doc.setFont(FONT, "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(report.chartCaption.toUpperCase(), MARGIN, y + 3);
  }
  // legenda
  const legend = (x: number, color: [number, number, number], label: string) => {
    doc.setFillColor(...color);
    doc.rect(x, y + 0.6, 3, 3, "F");
    doc.setFont(FONT, "normal");
    doc.setTextColor(...ink);
    doc.text(label, x + 4.2, y + 3);
    return x + 4.2 + doc.getTextWidth(label) + 5;
  };
  doc.setFontSize(7.5);
  const womenWidth = doc.getTextWidth(report.womenLabel) + 4.2;
  const menWidth = doc.getTextWidth(report.menLabel) + 4.2;
  legend(
    legend(PAGE_W - MARGIN - womenWidth - menWidth - 5, accent, report.menLabel),
    women,
    report.womenLabel,
  );
  y += 7;

  const plotH = height - 14;
  const max = Math.max(...bars.map((bar) => bar.men + bar.women), 1);
  const step = Math.ceil(max / 4 / 50) * 50 || 1;
  const axisMax = step * Math.ceil(max / step);
  const left = MARGIN + 8;
  const plotW = CONTENT_W - 8;
  const slot = plotW / bars.length;
  const barW = slot * 0.72;
  doc.setFontSize(6.5);
  doc.setLineWidth(0.15);
  for (let value = 0; value <= axisMax; value += step) {
    const gy = y + plotH - (value / axisMax) * plotH;
    doc.setDrawColor(...line);
    doc.line(left, gy, left + plotW, gy);
    doc.setTextColor(...muted);
    doc.text(String(value), left - 1.5, gy + 1, { align: "right" });
  }
  bars.forEach((bar, index) => {
    const x = left + index * slot + (slot - barW) / 2;
    const menH = (bar.men / axisMax) * plotH;
    const womenH = (bar.women / axisMax) * plotH;
    doc.setFillColor(...accent);
    doc.rect(x, y + plotH - menH, barW, menH, "F");
    doc.setFillColor(...women);
    doc.rect(x, y + plotH - menH - womenH, barW, womenH, "F");
    const label = bars.length > 24 ? `’${String(bar.year).slice(2)}` : String(bar.year);
    if (bars.length <= 40 || index % 2 === 0) {
      doc.setTextColor(...muted);
      doc.text(label, x + barW / 2, y + plotH + 3.4, { align: "center" });
    }
  });
  return y + plotH + 7;
}

function drawTables(doc: jsPDF, tables: StatsTableData[], layout: StatsLayout, top: number) {
  const { ink, paper, accent, line } = PRINT_COLORS;
  const size = layout.font;
  const rh = layout.rowHeight;
  const baseline = rh / 2 + size * PT_TO_MM * 0.35;
  const stripe = new Map<string, number>();
  for (const item of layout.items) {
    const x0 = MARGIN + item.column * (layout.columnWidth + COLUMN_GAP);
    const y0 = top + item.y;
    const table = tables[item.table];
    const geometry = layout.geometry[item.table];
    if (item.kind === "title") {
      doc.setFont(FONT, "bold");
      doc.setFontSize(size + 2);
      doc.setTextColor(...ink);
      doc.text(truncate(doc, table.title ?? "", layout.columnWidth), x0, y0 + item.height - 2.2);
      doc.setFillColor(...accent);
      doc.rect(x0, y0 + item.height - 1.2, 10, 0.6, "F");
      continue;
    }
    const isHead = item.kind === "head";
    if (isHead) {
      doc.setFillColor(...ink);
      doc.rect(x0, y0, layout.columnWidth, rh, "F");
    } else {
      const key = `${item.table}`;
      const n = (stripe.get(key) ?? 0) + 1;
      stripe.set(key, n);
      if (n % 2 === 0) {
        doc.setFillColor(...paper);
        doc.rect(x0, y0, layout.columnWidth, rh, "F");
      }
      doc.setDrawColor(...line);
      doc.setLineWidth(0.1);
      doc.line(x0, y0 + rh, x0 + layout.columnWidth, y0 + rh);
    }
    doc.setFont(FONT, isHead ? "bold" : "normal");
    doc.setFontSize(isHead ? size * 0.92 : size);
    doc.setTextColor(...(isHead ? ([255, 255, 255] as [number, number, number]) : ink));
    let x = x0;
    table.columns.forEach((column, index) => {
      const width = geometry.widths[index];
      const raw = isHead ? column : (table.rows[item.row]?.[index]?.text ?? "");
      const text = truncate(doc, raw, width - 2 * CELL_PAD);
      if (geometry.align[index] === "right") {
        doc.text(text, x + width - CELL_PAD, y0 + baseline, { align: "right" });
      } else {
        doc.text(text, x + CELL_PAD, y0 + baseline);
      }
      x += width;
    });
  }
}

/** Jednostránkové PDF statistiky (A4, česky) pro tisk a vyvěšení na závodě. */
export function renderStatsPdf(report: StatsReport, fonts: ReceiptFonts): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("DejaVuSans.ttf", fonts.regular);
  doc.addFont("DejaVuSans.ttf", FONT, "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", fonts.bold);
  doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold");
  doc.setProperties({
    title: `${report.title} – MCVV`,
    subject: report.eyebrow,
    creator: "www.mcvv.org",
  });

  let y = drawHeader(doc, report);
  if (report.chart && report.chart.length > 0) {
    y = drawChart(doc, report, y + 1, 62);
  }
  const bottom = PAGE_H - 18;
  let note: string | null = null;
  if (report.tables.length === 0 || report.tables.every((table) => table.rows.length === 0)) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(11);
    doc.setTextColor(...PRINT_COLORS.muted);
    doc.text(report.emptyText, MARGIN, y + 8);
  } else {
    const measure = (text: string, size: number, bold: boolean) => {
      doc.setFont(FONT, bold ? "bold" : "normal");
      doc.setFontSize(bold ? size * 0.92 : size);
      return doc.getTextWidth(text);
    };
    const layout = layoutStats(report.tables, CONTENT_W, bottom - y, measure);
    drawTables(doc, report.tables, layout, y);
    const omitted = layout.omitted.reduce((sum, n) => sum + n, 0);
    if (omitted > 0) {
      note = `Zkráceno o ${omitted} řádků – celé na webu`;
    }
  }
  drawFooter(doc, report, note);
  return new Uint8Array(doc.output("arraybuffer"));
}
