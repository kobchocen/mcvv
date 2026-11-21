/**
 * Vzorek 173 ve v15 paletě (černé číslo, forest pečeť) jako A5 PDF @ layout 300 dpi.
 * Slouží k pixelovému odečtu od oficiálního startovni-cislo-A5-v15-pmconsulting-veteran.png.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { prepareBibArtwork } from "@/lib/print/bib-artwork";
import { loadCourseProfileData, loadMcvvLogo, loadYearBadge } from "@/lib/print/bib-assets";
import { loadBibFonts } from "@/lib/print/bib-fonts";
import { BIB_FOREST, buildBibCard, type BuildBibOptions } from "@/lib/print/bibs-core";
import { rasterizeLogo } from "@/lib/print/partner-logos";
import { renderBibsPdf } from "@/lib/print/render-bibs";
import { DEFAULT_START_MODEL } from "@/lib/race/start-time";

async function main() {
  const outDir = path.resolve(process.argv[2] ?? "tmp/bib-sample");
  await mkdir(outDir, { recursive: true });
  const runner = {
    runnerId: "19840101",
    name: "Novák Jan",
    categoryId: "B",
    categoryName: "muži nad 40 let",
    birthYear: "1984",
    registrationId: 1,
    bib: 173,
  };
  const options: BuildBibOptions = {
    mode: "all",
    year: 2026,
    model: DEFAULT_START_MODEL,
    championBibs: [],
    veterans: new Map([["19840101", 35]]),
    winnerCounts: new Map(),
    logoCount: 1,
  };
  const card = buildBibCard(runner, options);
  // Oficiální v15: číslo zůstává černé, pečeť je forest.
  card.color = "black";
  card.seals = card.seals.map((seal) =>
    seal.kind === "veteran" ? { ...seal, fill: BIB_FOREST } : seal,
  );
  const [fonts, mcvvLogo, profile, yearBadge, partnerSvg] = await Promise.all([
    loadBibFonts(),
    loadMcvvLogo(),
    loadCourseProfileData(),
    loadYearBadge(2026),
    readFile(path.join(process.cwd(), "public/partners/pmconsulting.svg")),
  ]);
  const partner = await rasterizeLogo(partnerSvg);
  if (!partner) throw new Error("partner logo failed");
  const artwork = await prepareBibArtwork([card], 2026, profile);
  const pdf = renderBibsPdf(
    [card],
    {
      fonts,
      logos: [partner],
      mcvvLogo,
      profile,
      yearBadge,
      year: 2026,
      qrs: artwork.qrs,
      seals: artwork.seals,
    },
    { title: "MCVV 2026 — 173 v15 forest compare" },
  );
  const pdfPath = path.join(outDir, "mcvv-2026-173-v15-forest-compare.pdf");
  await writeFile(pdfPath, pdf);
  console.log(
    pdfPath,
    "color",
    card.color,
    "seals",
    card.seals.map((s) => `${s.fill}:${s.label}:${s.count}`).join(","),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
