import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_START_MODEL } from "@/lib/race/start-time";
import { loadReceiptFonts } from "@/lib/receipts/fonts";
import { STAT_SLUGS } from "@/lib/stats/core";

import { buildBibCard, buildBlankBibCard, type BuildBibOptions } from "./bibs-core";
import { renderBibsPdf } from "./render-bibs";
import { renderStatsPdf, type StatsReport } from "./render-stats";
import { statsTranslator } from "./stats-labels";
import { layoutStats } from "./stats-layout";

const options: BuildBibOptions = {
  mode: "all",
  year: 2026,
  model: DEFAULT_START_MODEL,
  championBibs: [400],
  veterans: new Map(),
  logoCount: 0,
};

function pages(pdf: Uint8Array): number {
  return (
    Buffer.from(pdf)
      .toString("latin1")
      .match(/\/Type \/Page\b/g) ?? []
  ).length;
}

describe("renderBibsPdf", () => {
  it("puts two bibs on an A4 page", async () => {
    const row = { runnerId: "r", name: "Příkladová Jana", categoryId: "F", registrationId: 3 };
    const cards = [
      buildBibCard({ ...row, bib: 901 }, options),
      buildBibCard({ ...row, bib: 400 }, options),
      buildBlankBibCard(381, { ...options, mode: "blank" }),
    ];
    const pdf = renderBibsPdf(cards, await loadReceiptFonts(), [], { title: "test" });
    assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("latin1"), "%PDF-");
    assert.equal(pages(pdf), 2);
  });
});

describe("stats report", () => {
  it("has Czech titles for all stat pages", () => {
    const t = statsTranslator();
    for (const slug of STAT_SLUGS) {
      assert.notEqual(t(`${slug}.title`), `${slug}.title`);
    }
  });

  it("fits a long table on one page (2 columns, smaller font)", () => {
    const rows = Array.from({ length: 90 }, (_, index) => [
      { text: String(index + 1) },
      { text: "Dlouhé Jméno Běžce" },
      { text: "15:10" },
    ]);
    const measure = (text: string, size: number) => text.length * size * 0.18;
    const layout = layoutStats([{ columns: ["#", "Běžec", "Čas"], rows }], 182, 230, measure);
    assert.equal(layout.omitted[0], 0);
    assert.ok(layout.columns >= 2);
    const rowsPlaced = layout.items.filter((item) => item.kind === "row").length;
    assert.equal(rowsPlaced, 90);
    for (const item of layout.items) {
      assert.ok(item.y + item.height <= 230 + 1e-6);
    }
  });

  it("truncates when nothing fits even at the minimum font", () => {
    const rows = Array.from({ length: 2000 }, () => [{ text: "x" }]);
    const layout = layoutStats([{ columns: ["a"], rows }], 182, 230, () => 1, 2);
    assert.ok(layout.omitted[0] > 0);
  });

  it("renders a single-page PDF", async () => {
    const report: StatsReport = {
      slug: "ucast",
      title: "Celková účast",
      intro: "Počet účastníků v jednotlivých letech.",
      eyebrow: "Statistiky · 1993–2025",
      tables: [
        {
          columns: ["Rok", "Účastníků"],
          rows: Array.from({ length: 33 }, (_, i) => [
            { text: String(1993 + i) },
            { text: String(100 + i) },
          ]),
        },
      ],
      chart: Array.from({ length: 33 }, (_, i) => ({ year: 1993 + i, men: 100 + i, women: 50 })),
      chartCaption: "Účast muži / ženy",
      menLabel: "Muži",
      womenLabel: "Ženy",
      emptyText: "Zatím tu nic není.",
      generatedAt: new Date("2026-12-06T08:00:00Z"),
    };
    const pdf = renderStatsPdf(report, await loadReceiptFonts());
    assert.equal(pages(pdf), 1);
  });
});
