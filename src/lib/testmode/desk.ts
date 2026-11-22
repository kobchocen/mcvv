import { prisma } from "@/lib/db/client";

import { testPhase } from "./config-core";
import { getActiveTestModeRun } from "./run";

/** Pokladna: testovací dohláška se nabízí jen při běžícím testu před jeho koncem. */
export async function loadTestOnsiteDesk(
  now = new Date(),
): Promise<{ runId: number; categories: { id: string; name: string }[] } | null> {
  const run = await getActiveTestModeRun();
  if (!run || run.status !== "running") return null;
  const phase = testPhase(run, now);
  if (phase !== "office" && phase !== "race") return null;
  const categories = await prisma.category.findMany({
    orderBy: { sort: "asc" },
    select: { id: true, name: true },
  });
  return { runId: run.id, categories };
}
