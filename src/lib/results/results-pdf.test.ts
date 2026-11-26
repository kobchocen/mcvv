import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadOfficialLogoPng } from "@/lib/print/official-logo";
import { loadReceiptFonts } from "@/lib/receipts/fonts";

import { formatResultsTime, renderResultsPdf } from "./results-pdf";

describe("renderResultsPdf", () => {
  it("formats times as m:ss", () => {
    assert.equal(formatResultsTime(910), "15:10");
    assert.equal(formatResultsTime(62), "1:02");
  });

  it("renders a branded PDF with the official logo and forest colours", async () => {
    const fonts = await loadReceiptFonts();
    const pdf = renderResultsPdf(
      {
        year: 2025,
        total: 3,
        dateLabel: "6. prosince 2025",
        weatherLabel: "zataženo, 2 °C",
        groups: [
          {
            name: "muži",
            rows: [
              {
                rank: "1",
                runnerName: "Novák Jan",
                birthYear: "1984",
                clubName: "K.O.B. Choceň",
                timeLabel: "15:10",
              },
            ],
          },
        ],
      },
      loadOfficialLogoPng("dark"),
      fonts,
    );
    const raw = Buffer.from(pdf).toString("latin1");
    assert.equal(Buffer.from(pdf.slice(0, 5)).toString("latin1"), "%PDF-");
    assert.match(raw, /\/Subtype\s*\/Image/);
    assert.doesNotMatch(raw, /\/Rect.*\/Round/);
  });
});
