import { prisma } from "@/lib/db/client";
import { loadRoster } from "@/lib/race/roster";

import { fieldCounts, type FieldCounts } from "./splits-field-core";
import { fieldBibsFrom, type FieldBibs } from "./splits-warning-core";
import type { Station } from "./stations";

export type { FieldBibs } from "./splits-warning-core";
export { EMPTY_FIELD_BIBS } from "./splits-warning-core";

export type FieldSnapshot = {
  counts: FieldCounts;
  bibs: FieldBibs;
};

/** Načte počty boxů i seznamy čísel pro varování na obrazovce Mezičasy. */
export async function loadFieldSnapshot(
  year: number,
  station: string,
  stations: readonly Station[],
): Promise<FieldSnapshot> {
  const [roster, splits, starts] = await Promise.all([
    loadRoster(year),
    prisma.split.findMany({ where: { year }, select: { bib: true, split: true } }),
    prisma.startCheck.findMany({ where: { year }, select: { bib: true } }),
  ]);
  const rosterBibs = roster.map((row) => row.bib);
  const startedBibs = new Set(starts.map((row) => row.bib));
  return {
    counts: fieldCounts({
      station,
      stations,
      rosterBibs,
      startedBibs,
      splits,
    }),
    bibs: fieldBibsFrom({ rosterBibs, startedBibs, splits }),
  };
}

/** Načte počty pro boxy na obrazovce Mezičasy v daném živém ročníku. */
export async function loadFieldCounts(
  year: number,
  station: string,
  stations: readonly Station[],
): Promise<FieldCounts> {
  return (await loadFieldSnapshot(year, station, stations)).counts;
}
