import { prisma } from "@/lib/db/client";

/**
 * Startovka stínového ročníku pro živé moduly: řádky `mcvv_test_start` aktivního testu
 * (losování / kopie + testovací dohlášky). Tvar odpovídá `RosterEntry` z `race/roster.ts`;
 * id běžce je syntetické (`T` + číslo), klub „TEST“, přihláška 0.
 */
export type TestRosterEntry = {
  bib: number;
  runnerId: string;
  runnerName: string;
  clubId: string;
  clubName: string;
  categoryId: string;
  registrationId: number;
};

export const TEST_CLUB_ID = "TEST";

export function testRunnerId(bib: number): string {
  return `T${String(bib).padStart(7, "0")}`;
}

/** Aktivní test (běží nebo skončil, ještě nezlikvidovaný), nejnovější. */
export async function activeTestModeRunId(): Promise<number | null> {
  const run = await prisma.testModeRun.findFirst({
    where: { status: { in: ["running", "ended"] } },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  return run?.id ?? null;
}

export async function loadTestRoster(
  runId?: number | null,
  bib?: { gte?: number; lt?: number; in?: number[] },
): Promise<TestRosterEntry[]> {
  const id = runId ?? (await activeTestModeRunId());
  if (id == null) return [];
  const rows = await prisma.testModeStart.findMany({
    where: { testRunId: id, ...(bib ? { bib } : {}) },
    orderBy: { bib: "asc" },
  });
  return rows.map((row) => ({
    bib: row.bib,
    runnerId: testRunnerId(row.bib),
    runnerName: row.name,
    clubId: TEST_CLUB_ID,
    clubName: row.club ?? "",
    categoryId: row.categoryId,
    registrationId: 0,
  }));
}
