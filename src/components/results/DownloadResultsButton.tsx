"use client";

import { Download } from "lucide-react";

import { loadOfficialLogoFromBytes } from "@/lib/print/official-logo-bytes";
import { formatResultsTime, renderResultsPdf } from "@/lib/results/results-pdf";

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
  /** Řádek počasí bez emoji (typ, stav trati, teplota) – když chybí, použije se původní text. */
  weatherText?: string;
  orderedCats: Category[];
  catGroups: Record<string, ResultItem[]>;
};

async function fetchLogo() {
  const resp = await fetch("/images/logo/mcvv-logo-barevne-na-tmave.png");
  if (!resp.ok) throw new Error("logo");
  return loadOfficialLogoFromBytes(new Uint8Array(await resp.arrayBuffer()));
}

async function fetchFonts(): Promise<{ regular: string; bold?: string } | undefined> {
  try {
    const resp = await fetch(
      "https://cdn.jsdelivr.net/gh/AaronFeng753/Waifu2x-Extension-GUI@master/SRC/Waifu2x-Extension-QT/fonts/DejaVuSans.ttf",
    );
    if (!resp.ok) return undefined;
    const buf = await resp.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return { regular: b64 };
  } catch {
    return undefined;
  }
}

export function DownloadResultsButton({
  year,
  total,
  editionInfo,
  weatherText,
  orderedCats,
  catGroups,
}: Props) {
  const handleDownload = async () => {
    const [logo, fonts] = await Promise.all([fetchLogo(), fetchFonts()]);
    let dateLabel: string | undefined;
    if (editionInfo?.date) {
      dateLabel = new Date(editionInfo.date).toLocaleDateString("cs-CZ", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    const weatherLabel = editionInfo
      ? weatherText
        ? weatherText
        : `${editionInfo.weather || "—"}, ${editionInfo.temp ?? "—"} °C`
      : undefined;
    const pdf = renderResultsPdf(
      {
        year,
        total,
        dateLabel,
        weatherLabel,
        groups: orderedCats
          .map((cat) => ({
            name: cat.name,
            rows: (catGroups[cat.id] || []).map((row) => ({
              rank: String(row._catRank ?? ""),
              runnerName: row.runnerName || "—",
              birthYear: row._birthYear ?? "—",
              clubName: row._clubName ?? "—",
              timeLabel: formatResultsTime(row.time),
            })),
          }))
          .filter((group) => group.rows.length > 0),
      },
      logo,
      fonts,
    );
    const copy = new ArrayBuffer(pdf.byteLength);
    new Uint8Array(copy).set(pdf);
    const blob = new Blob([copy], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vysledky_mcvv_${year}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
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
