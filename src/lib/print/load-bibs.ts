import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import {
  loadPublicStartList,
  loadStartSettings,
  type StartSettings,
} from "@/lib/race/startlist-load";

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

export type PrintStartList = {
  year: number;
  settings: StartSettings;
  /** Zdroj čísel: `start` = mcvv_start po importu z prezentace, jinak řádky přihlášek. */
  source: "start" | "registrations";
  rows: BibEntryRow[];
};

/** Čísla k tisku = aktuální startovka ročníku (stejný zdroj jako veřejná startovka a její PDF). */
export async function loadPrintStartList(): Promise<PrintStartList> {
  const { year } = await currentRaceYear();
  const settings = await loadStartSettings(year);
  const { rows, source } = await loadPublicStartList(year, settings.model);
  const lines = await prisma.registrationLine.findMany({
    where: { year, runnerId: { in: rows.map((row) => row.runnerId) } },
    select: { runnerId: true, registrationId: true },
  });
  const registrationOf = new Map(lines.map((line) => [line.runnerId, line.registrationId]));
  return { year, settings, source, rows: bibRowsFromStartList(rows, registrationOf) };
}

export async function loadBibCards(
  request: BibPrintRequest,
  logoCount: number,
): Promise<{ year: number; cards: BibCard[]; total: number }> {
  const { year, settings, rows: startRows } = await loadPrintStartList();
  const options = {
    mode: request.mode,
    year,
    model: settings.model,
    championBibs: request.championBibs ?? championBibList(settings.champions),
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

  const selected = new Set(request.bibs);
  const rows = sortBibRows(
    request.mode === "selected" ? startRows.filter((row) => selected.has(row.bib)) : startRows,
    request.order,
  );
  const batch =
    request.mode === "all" ? rows.slice(request.offset, request.offset + request.limit) : rows;
  return { year, cards: batch.map((row) => buildBibCard(row, options)), total: rows.length };
}
