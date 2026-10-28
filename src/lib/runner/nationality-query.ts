import { prisma } from "@/lib/db/client";

/**
 * Běžci s uvedenou státní příslušností (#200) jako id → kód. Historická data příslušnost
 * nemají, takže mapa je malá a výpisy si ji načtou jedním dotazem místo úprav každého selectu.
 */
export async function loadNationalityMap(
  runnerIds?: readonly string[],
): Promise<Map<string, string>> {
  if (runnerIds && runnerIds.length === 0) {
    return new Map();
  }
  const rows = await prisma.runner.findMany({
    where: {
      nationality: { not: null },
      ...(runnerIds ? { id: { in: [...new Set(runnerIds)] } } : {}),
    },
    select: { id: true, nationality: true },
  });
  return new Map(rows.map((row) => [row.id, row.nationality ?? ""]));
}
