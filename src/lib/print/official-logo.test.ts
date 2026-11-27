import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { jsPDF } from "jspdf";
import sharp from "sharp";

import {
  OFFICIAL_LOGO_ASPECT,
  OFFICIAL_LOGO_EMAIL_WIDTH_PX,
  OFFICIAL_LOGO_INK,
  OFFICIAL_LOGO_MIN_INK_WIDTH_MM,
  OFFICIAL_LOGO_PUBLIC_PATHS,
  drawOfficialLogo,
  loadOfficialLogoPng,
  officialAssetUrl,
  officialLogoEmailUrl,
  officialLogoPrintWidthMm,
  officialLogoSize,
} from "./official-logo";

const PRINT = path.join("src", "assets", "print");

describe("official MCVV logo assets", () => {
  it("keeps public PNGs identical to the print assets", () => {
    for (const name of ["mcvv-logo-barevne-na-tmave.png", "mcvv-logo-barevne-na-svetle.png"]) {
      const print = readFileSync(path.join(PRINT, name));
      const pub = readFileSync(path.join("public", "images", "logo", name));
      assert.deepEqual(pub, print);
    }
  });

  it("sizes the print mark so the ink is at least 25 mm wide", () => {
    const width = officialLogoPrintWidthMm();
    const ink = width * OFFICIAL_LOGO_INK.width;
    assert.ok(ink >= OFFICIAL_LOGO_MIN_INK_WIDTH_MM - 1e-9);
    const { height } = officialLogoSize(width);
    assert.ok(Math.abs(width / height - OFFICIAL_LOGO_ASPECT) < 1e-6);
    // E-mail: visible ink stays above the 120 px screen minimum.
    assert.ok(OFFICIAL_LOGO_EMAIL_WIDTH_PX * OFFICIAL_LOGO_INK.width >= 120);
  });

  it("matches the documented ink box of the official raster", async () => {
    const image = loadOfficialLogoPng("dark");
    assert.equal(image.pixelWidth, 1600);
    assert.equal(image.pixelHeight, 767);
    const trimmed = await sharp(image.data)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer({
        resolveWithObject: true,
      });
    const info = await sharp(image.data).metadata();
    // sharp.trim metadata: info.trimOffsetLeft / Top when using extract? use info of original + bbox
    const { info: tinfo } = trimmed;
    // After trim, width/height are the ink box; offsets are in tinfo.trim* on some versions.
    assert.ok(tinfo.width && tinfo.height);
    const expectedW = Math.round(OFFICIAL_LOGO_INK.width * image.pixelWidth);
    const expectedH = Math.round(OFFICIAL_LOGO_INK.height * image.pixelHeight);
    assert.ok(
      Math.abs((tinfo.width ?? 0) - expectedW) <= 2,
      `ink width ${tinfo.width} vs ${expectedW}`,
    );
    assert.ok(
      Math.abs((tinfo.height ?? 0) - expectedH) <= 2,
      `ink height ${tinfo.height} vs ${expectedH}`,
    );
    void info;
  });

  it("draws a PNG XObject, not a vector V in a rounded square", () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const image = loadOfficialLogoPng("dark");
    drawOfficialLogo(doc, image, 14, 10, officialLogoPrintWidthMm(), "mcvv-logo-dark");
    const raw = Buffer.from(doc.output("arraybuffer")).toString("latin1");
    assert.match(raw, /\/XObject|\/Subtype\s*\/Image/);
  });

  it("builds a hosted HTTPS logo URL without a trailing slash on the origin", () => {
    assert.equal(
      officialLogoEmailUrl("https://mcvv.org/"),
      "https://mcvv.org/images/logo/mcvv-logo-barevne-na-tmave.png",
    );
    assert.equal(
      officialAssetUrl("https://www.mcvv.org", OFFICIAL_LOGO_PUBLIC_PATHS.light),
      "https://www.mcvv.org/images/logo/mcvv-logo-barevne-na-svetle.png",
    );
  });
});

describe("PDF generators no longer draw the retired mark", () => {
  it("does not keep drawBrandMark or a vector V in a rounded square", () => {
    const files = [
      "src/lib/print/render-stats.ts",
      "src/lib/race/startlist-pdf.ts",
      "src/lib/print/presentation-pdf.ts",
      "src/lib/receipts/render-pdf.ts",
      "src/lib/results/results-pdf.ts",
      "src/components/results/DownloadResultsButton.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      assert.doesNotMatch(src, /drawBrandMark/);
      assert.doesNotMatch(src, /icon\.svg: zaoblený čtverec/);
      assert.doesNotMatch(src, /brandMark/);
    }
  });
});
