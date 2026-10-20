import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";

import { bibStartModel } from "./bib-start";
import {
  buildBibCard,
  buildBlankBibCard,
  sortBibRows,
  veteranMinStarts,
  type BibCard,
  type BibPrintRequest,
} from "./bibs-core";

/** bezec_id → počet startů pro veterány (stejné pravidlo jako legacy a stránka Veteráni). */
export async function loadVeterans(): Promise<Map<string, number>> {
  const [years, counts] = await Promise.all([
    prisma.result.groupBy({ by: ["year"] }),
    prisma.result.groupBy({ by: ["runnerId"], _count: { _all: true } }),
  ]);
  const min = veteranMinStarts(years.length);
  return new Map(
    counts
      .filter((row) => row._count._all >= min)
      .map((row) => [row.runnerId, row._count._all] as const),
  );
}

export async function loadBibCards(
  request: BibPrintRequest,
  logoCount: number,
): Promise<{ year: number; cards: BibCard[]; total: number }> {
  const { year } = await currentRaceYear();
  const edition = await prisma.edition.findFirst({
    orderBy: { id: "desc" },
    select: { startInterval: true },
  });
  const options = {
    mode: request.mode,
    year,
    model: bibStartModel(edition),
    championBibs: request.championBibs,
    logoCount,
    veterans: request.mode === "blank" ? new Map<string, number>() : await loadVeterans(),
  };

  if (request.mode === "blank") {
    return {
      year,
      cards: request.bibs.map((bib) => buildBlankBibCard(bib, options)),
      total: request.bibs.length,
    };
  }

  const lines = await prisma.registrationLine.findMany({
    where: {
      year,
      bib: request.mode === "selected" ? { in: request.bibs } : { gt: 0 },
    },
    select: {
      bib: true,
      runnerId: true,
      categoryId: true,
      registrationId: true,
      runner: { select: { name: true } },
    },
  });
  const rows = sortBibRows(
    lines
      .filter((line): line is typeof line & { bib: number } => (line.bib ?? 0) > 0)
      .map((line) => ({
        bib: line.bib,
        runnerId: line.runnerId,
        name: line.runner.name,
        categoryId: line.categoryId,
        registrationId: line.registrationId,
      })),
    request.order,
  );
  const batch =
    request.mode === "all" ? rows.slice(request.offset, request.offset + request.limit) : rows;
  return { year, cards: batch.map((row) => buildBibCard(row, options)), total: rows.length };
}
