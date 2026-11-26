import { prisma } from "@/lib/db/client";
import { loadRoster } from "@/lib/race/roster";

import { fieldCounts, type FieldCounts } from "./splits-field-core";
import type { Station } from "./stations";

/** Načte počty pro boxy na obrazovce Mezičasy v daném živém ročníku. */
export async function loadFieldCounts(
  year: number,
  station: string,
  stations: readonly Station[],
): Promise<FieldCounts> {
  const [roster, splits, starts] = await Promise.all([
    loadRoster(year),
    prisma.split.findMany({ where: { year }, select: { bib: true, split: true } }),
    prisma.startCheck.findMany({ where: { year }, select: { bib: true } }),
  ]);
  return fieldCounts({
    station,
    stations,
    rosterBibs: roster.map((row) => row.bib),
    startedBibs: new Set(starts.map((row) => row.bib)),
    splits,
  });
}
