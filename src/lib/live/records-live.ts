import { prisma } from "@/lib/db/client";

import { recordBaselines, type RecordBaselines } from "./records-live-core";

/**
 * Výchozí rekordy se mění jen importem výsledků (a ten je pro dřívější ročníky výjimečný),
 * proto stačí jeden výpočet za 10 minut na repliku – ne dotaz na každý snímek (Q162).
 */
export const RECORD_BASELINES_TTL_MS = 10 * 60_000;

let cached: { year: number; builtAt: number; value: Promise<RecordBaselines> } | null = null;

async function load(year: number): Promise<RecordBaselines> {
  const [categories, results] = await Promise.all([
    prisma.category.findMany({ select: { id: true, sex: true, age: true } }),
    prisma.result.findMany({
      where: { year: { lt: year } },
      select: {
        year: true,
        runnerId: true,
        time: true,
        runnerName: true,
        runner: { select: { name: true } },
      },
    }),
  ]);
  return recordBaselines(
    categories,
    results,
    year,
    (r) => (r.runnerName || r.runner.name).trim() || null,
  );
}

/** Rekordy před ročníkem `year` (držitel, rok) – sdílené v paměti repliky. */
export function getRecordBaselines(year: number, now = Date.now()): Promise<RecordBaselines> {
  if (cached && cached.year === year && now - cached.builtAt < RECORD_BASELINES_TTL_MS) {
    return cached.value;
  }
  const value = load(year).catch((error: unknown) => {
    // bez rekordů se živé výsledky ukážou dál, jen bez TR; příště se zkusí znovu
    console.error("[live] record baselines failed", error);
    cached = null;
    return new Map() as RecordBaselines;
  });
  cached = { year, builtAt: now, value };
  return value;
}

/** Po přepočtu rekordů / importu na téhle replice. */
export function clearRecordBaselines(): void {
  cached = null;
}
