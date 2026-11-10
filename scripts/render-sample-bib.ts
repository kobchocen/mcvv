/**
 * Ukázková startovní čísla (schválený vizuál) – Jan Novák, 173.
 * Varianty: veterán (forest), obhájce (oranžová), běžné (černé).
 * Spuštění z kořene webu: node --import tsx scripts/render-sample-bib.ts [výstupní-složka]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadCourseProfileData, loadMcvvLogo, loadYearBadge } from "@/lib/print/bib-assets";
import { loadBibFonts } from "@/lib/print/bib-fonts";
import { buildBibCard, type BuildBibOptions } from "@/lib/print/bibs-core";
import { rasterizeLogo } from "@/lib/print/partner-logos";
import { renderBibsPdf } from "@/lib/print/render-bibs";
import { DEFAULT_START_MODEL } from "@/lib/race/start-time";

const row = {
  bib: 173,
  runnerId: "19840101",
  name: "Novák Jan",
  categoryId: "B",
  categoryName: "muži nad 40 let",
  birthYear: "1984",
  registrationId: 1,
};

const base: Omit<BuildBibOptions, "championBibs" | "veterans"> = {
  mode: "all",
  year: 2026,
  model: DEFAULT_START_MODEL,
  logoCount: 1,
};

const variants: { file: string; title: string; options: BuildBibOptions }[] = [
  {
    file: "mcvv-2026-cislo-173-novak-veteran.pdf",
    title: "Startovní číslo MCVV 2026 – veterán 173",
    options: {
      ...base,
      championBibs: [],
      veterans: new Map([["19840101", 35]]),
    },
  },
  {
    file: "mcvv-2026-cislo-173-novak-obhajce.pdf",
    title: "Startovní číslo MCVV 2026 – obhájce 173",
    options: {
      ...base,
      championBibs: [173],
      veterans: new Map([["19840101", 35]]),
    },
  },
  {
    file: "mcvv-2026-cislo-173-novak-bezny.pdf",
    title: "Startovní číslo MCVV 2026 – běžné 173",
    options: { ...base, championBibs: [], veterans: new Map() },
  },
];

async function main() {
  const outDir = path.resolve(process.argv[2] ?? "tmp/bib-sample");
  await mkdir(outDir, { recursive: true });
  const [fonts, mcvvLogo, profile, yearBadge, partnerSvg] = await Promise.all([
    loadBibFonts(),
    loadMcvvLogo(),
    loadCourseProfileData(),
    loadYearBadge(2026),
    readFile(path.join(process.cwd(), "public/partners/pmconsulting.svg")),
  ]);
  const partner = await rasterizeLogo(partnerSvg);
  if (!partner) {
    throw new Error("Nepodařilo se vyrastrovat logo PM consulting");
  }
  const assets = { fonts, logos: [partner], mcvvLogo, profile, yearBadge, year: 2026 };
  for (const variant of variants) {
    const pdf = renderBibsPdf([buildBibCard(row, variant.options)], assets, {
      title: variant.title,
    });
    const pdfPath = path.join(outDir, variant.file);
    await writeFile(pdfPath, pdf);
    console.log(pdfPath);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
