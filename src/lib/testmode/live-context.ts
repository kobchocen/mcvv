import type { RaceContext } from "@/lib/live/race-context";

import { TEST_SHADOW_YEAR, type TestPhase } from "./config-core";

/**
 * Testovací nula je nula ročníku (10:15). Posun pořadatelů (−2,5 h k 7:45) se v testu
 * neuplatní (`organizerShiftSeconds = 0`): pořadatelé startují v testové nule, ostatní
 * za nimi po intervalu ročníku ve stejných slotech jako v ostrém závodě. Mezera
 * 7:45–10:15 se v testu nezachovává — fáze končí v T+3 h a likvidace v T+5 h, s
 * 2,5h mezerou by hlavní pole nestihlo startér, mezičasy ani cíl. Veřejné výstupy
 * (`getRaceContext`) si ostrý posun nechávají.
 */
export function applyTestRunToRaceContext(
  base: RaceContext,
  run: { id: number; zeroAt: Date; status: string },
  phase: TestPhase,
): RaceContext {
  if (phase === "cleanup") return base;
  return {
    ...base,
    year: TEST_SHADOW_YEAR,
    zero: run.zeroAt,
    officialZero: run.zeroAt,
    zeroOverridden: true,
    organizerShiftSeconds: 0,
    testRunId: run.id,
    testReadOnly: phase === "ended" || run.status !== "running",
  };
}
