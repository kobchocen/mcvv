import { renderBibQrPng } from "./bib-qr";
import { renderBibSealPng, sealCacheKey } from "./bib-seals";
import type { BibCard } from "./bibs-core";
import type { CoursePoint } from "./course-profile";
import type { BibLogo } from "./render-bibs";

export type BibArtwork = {
  qrs: Map<number, BibLogo>;
  seals: Map<string, BibLogo>;
};

/** Rastr QR a pečetí pro dané karty (bez DB). */
export async function prepareBibArtwork(
  cards: BibCard[],
  year: number,
  profile: readonly CoursePoint[],
  root: string = process.cwd(),
): Promise<BibArtwork> {
  const qrs = new Map<number, BibLogo>();
  const seals = new Map<string, BibLogo>();
  const bibs = [...new Set(cards.map((card) => card.bib))];
  await Promise.all(
    bibs.map(async (bib) => {
      qrs.set(bib, await renderBibQrPng(year, bib, { root }));
    }),
  );
  const unique = new Map<string, BibCard["seals"][number]>();
  for (const card of cards) {
    for (const seal of card.seals) {
      unique.set(sealCacheKey(seal), seal);
    }
  }
  await Promise.all(
    [...unique.entries()].map(async ([key, seal]) => {
      seals.set(key, await renderBibSealPng(seal, profile, { root }));
    }),
  );
  return { qrs, seals };
}
