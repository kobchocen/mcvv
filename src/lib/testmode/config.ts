import { prisma } from "@/lib/db/client";

import {
  parseTestModeConfig,
  serializeTestModeConfig,
  TEST_MODE_CONFIG_KEY,
  type TestModeConfig,
} from "./config-core";

export * from "./config-core";

/** Konfigurace testovacího režimu z nastavení (chybějící = výchozí hodnoty návrhu). */
export async function loadTestModeConfig(): Promise<TestModeConfig> {
  const row = await prisma.setting.findUnique({
    where: { key: TEST_MODE_CONFIG_KEY },
    select: { text: true },
  });
  return parseTestModeConfig(row?.text ?? null);
}

/** Uloží konfiguraci (vždy znormalizovanou); audit dělá volající (withSettingsAudit). */
export async function saveTestModeConfig(config: TestModeConfig): Promise<void> {
  const text = serializeTestModeConfig(config);
  await prisma.setting.upsert({
    where: { key: TEST_MODE_CONFIG_KEY },
    update: { text },
    create: { key: TEST_MODE_CONFIG_KEY, text },
  });
}

/** Přehled testů pro administraci (nejnovější první). Zápis testů zatím žádný modul nedělá. */
export async function listTestModeRuns(take = 10) {
  return prisma.testModeRun.findMany({
    orderBy: { zeroAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      zeroAt: true,
      endAt: true,
      cleanupAt: true,
      roster: true,
      fictional: true,
      _count: { select: { starts: true, onsites: true } },
    },
  });
}
