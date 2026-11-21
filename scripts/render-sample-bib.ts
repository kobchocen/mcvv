/**
 * Náhled startovních čísel bez DB: A4 na výšku, dvě A5 pod sebou.
 * Pět vzorků (Pavel 21. 11. 2026): černé, zelené veterán, oranžové vítěz,
 * zlaté obhájce, vítěz + veterán.
 * Spuštění z kořene webu: node --import tsx scripts/render-sample-bib.ts [výstupní-složka]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { prepareBibArtwork } from "@/lib/print/bib-artwork";
import { loadCourseProfileData, loadMcvvLogo, loadYearBadge } from "@/lib/print/bib-assets";
import { loadBibFonts } from "@/lib/print/bib-fonts";
import { buildBibCard, type BuildBibOptions } from "@/lib/print/bibs-core";
import { rasterizeLogo } from "@/lib/print/partner-logos";
import { renderBibsPreviewA4 } from "@/lib/print/render-bibs";
import { DEFAULT_START_MODEL } from "@/lib/race/start-time";

const runner = {
  runnerId: "19840101",
  name: "Novák Jan",
  categoryId: "B",
  categoryName: "muži nad 40 let",
  birthYear: "1984",
  registrationId: 1,
};

const base: Omit<BuildBibOptions, "championBibs" | "veterans" | "winnerCounts"> = {
  mode: "all",
  year: 2026,
  model: DEFAULT_START_MODEL,
  logoCount: 1,
};

const empty = new Map<string, number>();

const variants = [
  {
    title: "Černé — běžný závodník",
    card: buildBibCard(
      { ...runner, bib: 41, runnerId: "19900101" },
      { ...base, championBibs: [], veterans: empty, winnerCounts: empty },
    ),
  },
  {
    title: "Zelené — veterán 35 startů",
    card: buildBibCard(
      { ...runner, bib: 173 },
      {
        ...base,
        championBibs: [],
        veterans: new Map([["19840101", 35]]),
        winnerCounts: empty,
      },
    ),
  },
  {
    title: "Oranžové — historický vítěz, 3 výhry",
    card: buildBibCard(
      { ...runner, bib: 131, runnerId: "19820101" },
      {
        ...base,
        championBibs: [],
        veterans: empty,
        winnerCounts: new Map([["19820101", 3]]),
      },
    ),
  },
  {
    title: "Zlaté — obhájce, 2 výhry",
    card: buildBibCard(
      { ...runner, bib: 400, runnerId: "19830101" },
      {
        ...base,
        championBibs: [400],
        veterans: empty,
        winnerCounts: new Map([["19830101", 2]]),
      },
    ),
  },
  {
    title: "Oranžové — vítěz 3 výhry + veterán 35 startů",
    card: buildBibCard(
      { ...runner, bib: 250 },
      {
        ...base,
        championBibs: [],
        veterans: new Map([["19840101", 35]]),
        winnerCounts: new Map([["19840101", 3]]),
      },
    ),
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
  const cards = variants.map((variant) => variant.card);
  const artwork = await prepareBibArtwork(cards, 2026, profile);
  const pdf = renderBibsPreviewA4(
    cards,
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
    { title: "Náhled startovních čísel MCVV 2026 — 2×A5" },
  );
  const pdfPath = path.join(outDir, "mcvv-2026-cisla-nahled-a4-2xA5.pdf");
  await writeFile(pdfPath, pdf);
  console.log(pdfPath);
  for (const variant of variants) {
    console.log(
      `${variant.card.bib}\t${variant.card.color}\t${variant.title}\tseals=${variant.card.seals
        .map((s) => `${s.placement}:${s.label}:${s.count}`)
        .join(",")}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
