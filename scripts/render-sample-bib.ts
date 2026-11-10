/**
 * Ukázkové startovní číslo (schválený vizuál) – Jan Novák, 173, 35 účastí.
 * Spuštění z kořene webu: node --import tsx scripts/render-sample-bib.ts [výstupní-složka]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_START_MODEL } from "@/lib/race/start-time";
import { loadCourseProfileData, loadMcvvLogo, loadYearBadge } from "@/lib/print/bib-assets";
import { loadBibFonts } from "@/lib/print/bib-fonts";
import { buildBibCard, type BuildBibOptions } from "@/lib/print/bibs-core";
import { rasterizeLogo } from "@/lib/print/partner-logos";
import { renderBibsPdf } from "@/lib/print/render-bibs";

const options: BuildBibOptions = {
  mode: "all",
  year: 2026,
  model: DEFAULT_START_MODEL,
  championBibs: [],
  veterans: new Map([["19840101", 35]]),
  logoCount: 1,
};

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
  const card = buildBibCard(
    {
      bib: 173,
      runnerId: "19840101",
      name: "Novák Jan",
      categoryId: "B",
      categoryName: "muži nad 40 let",
      birthYear: "1984",
      registrationId: 1,
    },
    options,
  );
  const pdf = renderBibsPdf(
    [card],
    { fonts, logos: [partner], mcvvLogo, profile, yearBadge, year: 2026 },
    { title: "Startovní číslo MCVV 2026 – ukázka 173" },
  );
  const pdfPath = path.join(outDir, "mcvv-2026-cislo-173-novak.pdf");
  await writeFile(pdfPath, pdf);
  console.log(pdfPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
