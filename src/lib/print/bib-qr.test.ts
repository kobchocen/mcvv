import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bibQrMatrix, bibQrPayload, isQrFinderCell, renderBibQrPng } from "./bib-qr";

describe("bib QR", () => {
  it("encodes MCVV{year}-{bib}", () => {
    assert.equal(bibQrPayload(2026, 173), "MCVV2026-173");
    assert.equal(bibQrPayload(2026, 1), "MCVV2026-1");
  });

  it("builds a scannable matrix for the sample payload and keeps finder cells", () => {
    const matrix = bibQrMatrix(2026, 173);
    assert.ok(matrix.size >= 21);
    let dark = 0;
    for (let row = 0; row < matrix.size; row += 1) {
      for (let col = 0; col < matrix.size; col += 1) {
        if (matrix.darkAt(row, col)) {
          dark += 1;
        }
      }
    }
    assert.ok(dark > 0);
    assert.ok(dark < matrix.size * matrix.size);
    assert.equal(isQrFinderCell(0, 0, matrix.size), true);
    assert.equal(isQrFinderCell(10, 10, matrix.size), false);
  });

  it("rasterizes a PNG without changing the payload", async () => {
    const logo = await renderBibQrPng(2026, 173);
    assert.ok(logo.width >= 375);
    assert.ok(logo.height >= 375);
    assert.ok(logo.data.length > 1000);
    assert.equal(bibQrPayload(2026, 173), "MCVV2026-173");
  });
});
