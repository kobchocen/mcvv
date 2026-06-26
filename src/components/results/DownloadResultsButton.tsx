"use client";

import { Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Category = {
  id: string;
  name: string;
};

type ResultItem = {
  _catRank?: number;
  runnerName: string | null;
  _birthYear?: string;
  _clubName?: string;
  time: number;
};

type Props = {
  year: number;
  total: number;
  editionInfo: { date?: Date | null; weather?: string | null; temp?: number | null } | null;
  orderedCats: Category[];
  catGroups: Record<string, ResultItem[]>;
};

export function DownloadResultsButton({ year, total, editionInfo, orderedCats, catGroups }: Props) {
  const handleDownload = async () => {
    const doc = new jsPDF({ compress: true });
    const pageWidth = doc.internal.pageSize.getWidth();

    // === Robust Czech support: load DejaVu font ===
    let fontOk = false;
    try {
      const resp = await fetch(
        "https://cdn.jsdelivr.net/gh/AaronFeng753/Waifu2x-Extension-GUI@master/SRC/Waifu2x-Extension-QT/fonts/DejaVuSans.ttf",
      );
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        doc.addFileToVFS("DejaVuSans.ttf", b64);
        doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
        doc.setFont("DejaVu", "normal");
        fontOk = true;
      }
    } catch {}

    if (!fontOk) {
      doc.setFont("helvetica", "normal");
    } else {
      doc.setFont("DejaVu", "normal");
    }

    // === Modern header matching the website style ===
    // Green top bar
    doc.setFillColor(0, 128, 0);
    doc.rect(0, 0, pageWidth, 18, "F");

    doc.setTextColor(255);
    doc.setFontSize(14);
    doc.text("Malá cena Velké Verandy", pageWidth / 2, 12, { align: "center" });

    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.text(`Výsledky ročníku ${year}`, pageWidth / 2, 25, { align: "center" });

    let y = 32;
    if (editionInfo?.date) {
      const d = new Date(editionInfo.date);
      const dateStr = d.toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      doc.setFontSize(9);
      doc.text(dateStr, pageWidth / 2, y, { align: "center" });
      y += 5;
    }

    doc.setFontSize(9);
    doc.text(`Počet účastníků: ${total}`, 14, y);
    y += 5;
    if (editionInfo) {
      doc.text(`Počasí: ${editionInfo.weather || "—"}, ${editionInfo.temp ?? "—"} °C`, 14, y);
      y += 6;
    }

    // === Category sections with clean modern tables ===
    orderedCats.forEach((cat) => {
      const group = catGroups[cat.id] || [];
      if (group.length === 0) return;

      // Green accent header bar
      doc.setFillColor(0, 128, 0);
      doc.rect(14, y - 3, pageWidth - 28, 6, "F");
      doc.setTextColor(255);
      doc.setFontSize(9);
      doc.text(`${cat.name} (${group.length})`, 16, y + 1);

      y += 6;
      doc.setTextColor(0);

      const tableData = group.map((r) => [
        String(r._catRank ?? ""),
        r.runnerName || "—",
        r._birthYear ?? "—",
        r._clubName ?? "—",
        formatTime(r.time),
      ]);

      autoTable(doc, {
        startY: y,
        head: [["#", "Jméno", "Roč. nar.", "Klub", "Čas"]],
        body: tableData,
        styles: {
          fontSize: 7.5,
          font: fontOk ? "DejaVu" : "helvetica",
          cellPadding: 1.2,
        },
        headStyles: {
          fillColor: [0, 128, 0],
          textColor: 255,
          font: fontOk ? "DejaVu" : "helvetica",
          fontStyle: "bold",
        },
        margin: { left: 14, right: 14 },
      });

      y = ((doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 6;
    });

    // Footer
    doc.setFontSize(6);
    doc.setTextColor(120);
    doc.text(
      "Malá cena Velké Verandy • oficiální web",
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" },
    );

    doc.save(`vysledky_mcvv_${year}.pdf`);
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <button
      onClick={handleDownload}
      className="inline-flex items-center gap-1.5 rounded-md border border-race-line/60 px-3 py-1.5 text-sm font-semibold text-race-muted transition hover:bg-race-forest hover:text-foreground"
      title="Stáhnout PDF"
    >
      <Download className="h-4 w-4" />
      PDF
    </button>
  );
}
