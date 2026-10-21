import assert from "node:assert/strict";
import { describe, it } from "node:test";

import legacy from "./fixtures/legacy-barcode.json";
import { bibBarcodeText, code128BPattern, LEGACY_QUIET_MODULES, patternBars } from "./code128";

/**
 * Rastrování přesně jako legacy barcode.php (GD imagefilledrectangle, svisle, sizefactor 2):
 * kreslí se od modulu 10, obdélníky včetně koncového pixelu, další prvek ho přepíše.
 */
function legacyRaster(pattern: string, sizeFactor = 2): { height: number; runs: string } {
  const widths = [...pattern].map(Number);
  const length = LEGACY_QUIET_MODULES * 2 + widths.reduce((sum, w) => sum + w, 0);
  const height = length * sizeFactor;
  const pixels = new Array<number>(height).fill(0);
  let location = LEGACY_QUIET_MODULES;
  widths.forEach((width, index) => {
    const end = location + width;
    const color = index % 2 === 0 ? 1 : 0;
    for (let y = location * sizeFactor; y <= Math.min(end * sizeFactor, height - 1); y += 1) {
      pixels[y] = color;
    }
    location = end;
  });
  const runs: string[] = [];
  let current = pixels[0];
  let count = 0;
  for (const pixel of pixels) {
    if (pixel === current) {
      count += 1;
    } else {
      runs.push(`${current}${count}`);
      current = pixel;
      count = 1;
    }
  }
  runs.push(`${current}${count}`);
  return { height, runs: runs.join(",") };
}

describe("code128BPattern (legacy barcode.php)", () => {
  const samples = Object.entries(legacy.samples);

  it("has legacy fixtures decoded as CODE-128 with the bib number", () => {
    assert.ok(samples.length >= 10);
    for (const [bib, sample] of samples) {
      assert.equal(sample.zbar, `CODE-128:${bib}`);
    }
  });

  for (const [bib, sample] of samples) {
    it(`matches legacy pixels for bib ${bib}`, () => {
      const raster = legacyRaster(code128BPattern(bibBarcodeText(Number(bib))));
      assert.equal(raster.height, sample.height);
      assert.equal(raster.runs, sample.runs);
    });
  }

  it("encodes a known sample (41 = Start B, '4', '1', check 55, Stop)", () => {
    // 104 + 20·1 + 17·2 = 158 → 158 mod 103 = 55
    assert.equal(code128BPattern("41"), "211214" + "221231" + "123221" + "311321" + "2331112");
  });

  it("uses the bib without leading zeros", () => {
    assert.equal(bibBarcodeText(7), "7");
    assert.throws(() => bibBarcodeText(0));
  });

  it("splits a pattern into bars", () => {
    const { bars, modules } = patternBars("211214" + "2331112");
    assert.equal(modules, 24);
    assert.deepEqual(bars.slice(0, 3), [
      { start: 0, width: 2 },
      { start: 3, width: 1 },
      { start: 6, width: 1 },
    ]);
  });
});
