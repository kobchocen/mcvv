import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadReceiptFonts } from "@/lib/receipts/fonts";

import { DEFAULT_START_MODEL, startTimeForBib } from "./start-time";
import { renderStartListPdf, type StartListPdfLabels } from "./startlist-pdf";

const LABELS: StartListPdfLabels = {
  brandTop: "MALÁ CENA",
  brandBottom: "VELKÉ VERANDY",
  brandMark: "V",
  title: "Startovní listina 2026",
  edition: "34. ročník",
  raceDay: "neděle 6. 12. 2026",
  model: "Start 10:15:00",
  count: "2 závodníci",
  legend: "Oranžově 2. start",
  colTime: "Start",
  colBib: "Č.",
  colName: "Jméno",
  colBirth: "Roč.",
  colClub: "Klub",
  colCategory: "Kategorie",
  footer: "www.mcvv.org",
  page: (page, pages) => `Strana ${page} / ${pages}`,
  empty: "Prázdné",
};

describe("renderStartListPdf", () => {
  it("renders a multi-page A4 PDF with Czech text", async () => {
    const fonts = await loadReceiptFonts();
    const rows = Array.from({ length: 140 }, (_, i) => {
      const bib = i % 2 ? 601 + i : 1 + i;
      return {
        bib,
        time: startTimeForBib(DEFAULT_START_MODEL, bib),
        runnerId: `1990${String(i).padStart(4, "0")}`,
        name: `Žluťoučký Kůň ${i}`,
        birthYear: "1990",
        club: "Kob Choceň",
        clubId: "CHC",
        categoryId: "A",
        categoryName: "muži",
      };
    });
    const pdf = renderStartListPdf(rows, DEFAULT_START_MODEL, LABELS, fonts);
    const head = Buffer.from(pdf.slice(0, 5)).toString("latin1");
    assert.equal(head, "%PDF-");
    const raw = Buffer.from(pdf).toString("latin1");
    assert.ok((raw.match(/\/Type \/Page\b/g) ?? []).length >= 2);
  });
  it("renders an empty list", async () => {
    const pdf = renderStartListPdf([], DEFAULT_START_MODEL, LABELS, await loadReceiptFonts());
    assert.ok(pdf.length > 1000);
  });
});
