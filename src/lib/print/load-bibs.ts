import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import {
  loadPublicStartList,
  loadStartSettings,
  type StartSettings,
} from "@/lib/race/startlist-load";

import { absoluteWinnerCountsFrom } from "./bib-winners";
import { bibRowsFromStartList, championBibList } from "./bib-start";
import {
  buildBibCard,
  buildBlankBibCard,
  sortBibRows,
  veteranMinStarts,
  type BibCard,
  type BibEntryRow,
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

/** bezec_id → počet historických absolutních vítězství (před ročníkem tisku). */
export async function loadWinnerCounts(year: number): Promise<Map<string, number>> {
  const rows = await prisma.result.findMany({
    where: { year: { lt: year }, time: { gt: 0 } },
    select: { year: true, runnerId: true, time: true },
  });
  return absoluteWinnerCountsFrom(rows, { beforeYear: year });
}

export type PrintStartList = {
  year: number;
  settings: StartSettings;
  rows: BibEntryRow[];
};

/** Čísla k tisku = aktuální startovka ročníku (stejný zdroj jako veřejná startovka a její PDF). */
export async function loadPrintStartList(): Promise<PrintStartList> {
  const { year } = await currentRaceYear();
  const settings = await loadStartSettings(year);
  const { rows } = await loadPublicStartList(year, settings.model);
  const lines = await prisma.registrationLine.findMany({
    where: { year, runnerId: { in: rows.map((row) => row.runnerId) } },
    select: { runnerId: true, registrationId: true },
  });
  const registrationOf = new Map(lines.map((line) => [line.runnerId, line.registrationId]));
  return { year, settings, rows: bibRowsFromStartList(rows, registrationOf) };
}

export async function loadBibCards(
  request: BibPrintRequest,
  logoCount: number,
): Promise<{ year: number; cards: BibCard[]; total: number }> {
  const { year, settings, rows: startRows } = await loadPrintStartList();
  const empty = new Map<string, number>();
  const [veterans, winnerCounts] =
    request.mode === "blank"
      ? [empty, empty]
      : await Promise.all([loadVeterans(), loadWinnerCounts(year)]);
  const options = {
    mode: request.mode,
    year,
    model: settings.model,
    championBibs: request.championBibs ?? championBibList(settings.champions),
    logoCount,
    veterans,
    winnerCounts,
  };

  if (request.mode === "blank") {
    return {
      year,
      cards: request.bibs.map((bib) => buildBlankBibCard(bib, options)),
      total: request.bibs.length,
    };
  }

  const selected = new Set(request.bibs);
  const rows = sortBibRows(
    request.mode === "selected" ? startRows.filter((row) => selected.has(row.bib)) : startRows,
    request.order,
  );
  const batch =
    request.mode === "all" ? rows.slice(request.offset, request.offset + request.limit) : rows;
  return { year, cards: batch.map((row) => buildBibCard(row, options)), total: rows.length };
}
