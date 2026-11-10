import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bibQrMatrix, bibQrPayload } from "./bib-qr";

describe("bib QR", () => {
  it("encodes MCVV{year}-{bib}", () => {
    assert.equal(bibQrPayload(2026, 173), "MCVV2026-173");
    assert.equal(bibQrPayload(2026, 1), "MCVV2026-1");
  });

  it("builds a scannable matrix for the sample payload", () => {
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
  });
});
