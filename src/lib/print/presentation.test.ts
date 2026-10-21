import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_START_MODEL } from "@/lib/race/start-time";
import { loadReceiptFonts } from "@/lib/receipts/fonts";

import {
  buildAlphabetRows,
  buildPresentationBlocks,
  parseStartListOrder,
  presentationTotals,
  sortStartList,
  type PresentationLine,
  type PresentationRegistration,
} from "./presentation-core";
import { presentationPdfLabels } from "./presentation-labels";
import { renderAlphabetPdf, renderPresentationPdf } from "./presentation-pdf";

const model = DEFAULT_START_MODEL;

function line(
  registrationId: number,
  bib: number | null,
  name: string,
  fee = 150,
  runnerId = "19805001",
): PresentationLine {
  return {
    registrationId,
    bib,
    runnerId,
    name,
    club: "Klub",
    categoryId: "A",
    categoryName: "muži",
    fee,
  };
}

const registrations: PresentationRegistration[] = [
  { id: 12, name: "Rodina Nováků", email: "a@example.cz", status: 2 },
  { id: 3, name: null, email: "b@example.cz", status: 5 },
  { id: 7, name: "Prázdná", email: null, status: 1 },
];
const lines = [
  line(12, 605, "Nováková Eva", 150, "19855001"),
  line(12, 4, "Novák Jan"),
  line(12, null, "Novák Petr", 100),
  line(3, 2, "Čermák Adam", 0),
  line(99, 9, "Zrušený Běžec"),
];

function pages(pdf: Uint8Array): number {
  return (
    Buffer.from(pdf)
      .toString("latin1")
      .match(/\/Type \/Page\b/g) ?? []
  ).length;
}

describe("presentation reports (#125)", () => {
  it("builds one block per registration with times, fee and amount due", () => {
    const blocks = buildPresentationBlocks(
      registrations,
      lines,
      new Map([
        [12, 250],
        [3, 50],
      ]),
      model,
    );
    assert.deepEqual(
      blocks.map((b) => b.id),
      [3, 12],
      "sorted by registration, empty registration and unknown ids skipped",
    );
    const family = blocks[1];
    assert.equal(family.label, "12 · Rodina Nováků");
    assert.deepEqual(
      family.rows.map((r) => [r.bib, r.time, r.birthYear]),
      [
        [4, "10:15:45", "1980"],
        [605, "10:16:00", "1985"],
        [null, "", "1980"],
      ],
      "by bib, runners without bib last; legacy time 10:15 + 15 s × (n − 1)",
    );
    assert.equal(family.fee, 400);
    assert.equal(family.paid, 250);
    assert.equal(family.due, 150);
    assert.equal(blocks[0].label, "3 · b@example.cz");
    assert.equal(blocks[0].due, 0);
    assert.equal(blocks[0].overpaid, 50);
    assert.deepEqual(presentationTotals(blocks), {
      registrations: 2,
      runners: 4,
      fee: 400,
      paid: 250,
      due: 150,
    });
  });

  it("lists runners alphabetically (Czech collation) with the registration number", () => {
    const rows = buildAlphabetRows(registrations, lines, model);
    assert.deepEqual(
      rows.map((r) => [r.name, r.registrationLabel]),
      [
        ["Čermák Adam", "3"],
        ["Novák Jan", "12"],
        ["Novák Petr", "12"],
        ["Nováková Eva", "12"],
      ],
    );
  });

  it("sorts the printable start list by time (waves interleaved) or by bib", () => {
    const rows = [{ bib: 602 }, { bib: 3 }, { bib: 1 }, { bib: 601 }];
    assert.deepEqual(
      sortStartList(rows, model, "time").map((r) => r.bib),
      [1, 601, 602, 3],
    );
    assert.deepEqual(
      sortStartList(rows, model, "bib").map((r) => r.bib),
      [1, 3, 601, 602],
    );
    assert.equal(parseStartListOrder("cislo"), "bib");
    assert.equal(parseStartListOrder(null), "time");
  });

  it("renders A4 PDFs with Czech labels, optionally a page per registration", async () => {
    const fonts = await loadReceiptFonts();
    const blocks = buildPresentationBlocks(registrations, lines, new Map(), model);
    const labels = presentationPdfLabels("cs", "presentation", {
      year: 2026,
      generatedAt: new Date("2026-12-06T08:00:00Z"),
      totals: presentationTotals(blocks),
    });
    assert.equal(labels.due(1250), "Zbývá uhradit 1\u00a0250 Kč");
    assert.equal(
      labels.blockTotal(blocks[1]),
      "Celkem 3 závodníci · startovné 400 Kč · uhrazeno 0 Kč",
    );
    const pdf = renderPresentationPdf(blocks, labels, fonts);
    assert.equal(Buffer.from(pdf.slice(0, 5)).toString("latin1"), "%PDF-");
    assert.equal(pages(pdf), 1);
    assert.equal(
      pages(renderPresentationPdf(blocks, labels, fonts, { pagePerRegistration: true })),
      2,
    );
    const alphabet = renderAlphabetPdf(
      buildAlphabetRows(registrations, lines, model),
      presentationPdfLabels("en", "alphabet", {
        year: 2026,
        generatedAt: new Date(),
        totals: { registrations: 2, runners: 4, fee: 0, due: 0 },
      }),
      fonts,
    );
    assert.equal(pages(alphabet), 1);
  });
});
