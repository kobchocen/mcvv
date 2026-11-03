import { prisma } from "@/lib/db/client";
import { HOME_COUNTRY } from "@/lib/runner/nationality";

/**
 * Běžci s uvedenou státní příslušností (#200) jako id → kód. Výpisy (výsledky, startovka)
 * ukazují vlaječku jen u zahraničních běžců, proto si s `foreignOnly` načtou jen ty – po
 * doplnění CZ všem běžcům je to pořád malá mapa. Statistiky potřebují i domácí stát.
 */
export async function loadNationalityMap(
  runnerIds?: readonly string[],
  { foreignOnly = false }: { foreignOnly?: boolean } = {},
): Promise<Map<string, string>> {
  if (runnerIds && runnerIds.length === 0) {
    return new Map();
  }
  const rows = await prisma.runner.findMany({
    where: {
      nationality: foreignOnly ? { not: null, notIn: [HOME_COUNTRY] } : { not: null },
      ...(runnerIds ? { id: { in: [...new Set(runnerIds)] } } : {}),
    },
    select: { id: true, nationality: true },
  });
  return new Map(rows.map((row) => [row.id, row.nationality ?? ""]));
}
