/**
 * Data stránky sloučení běžců (#261): všichni běžci s ročníky (pro výběr a návrhy) a
 * přehled provedených sloučení z auditu.
 */
import { Prisma } from "@prisma/client";

import {
  RUNNER_MERGE_HISTORY_LIMIT,
  runnerMergeHistoryEntry,
  type RunnerMergeHistoryEntry,
} from "@/lib/admin/runner-merge-core";
import { prisma } from "@/lib/db/client";

export type RunnerMergeIndexRow = {
  id: string;
  name: string;
  /** Ročníky závodu (přihláška, startovka nebo výsledek), od nejnovějšího. */
  years: number[];
  /** Počet výsledků (mcvv_time) = počet startů. */
  results: number;
};

export async function loadRunnerMergeIndex(): Promise<RunnerMergeIndexRow[]> {
  const [runners, yearRows, resultRows] = await Promise.all([
    prisma.runner.findMany({
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.$queryRaw<{ id: string; rok: number }[]>(Prisma.sql`
      SELECT bezec_id AS id, rok FROM mcvv_time
      UNION SELECT bezec_id, rok FROM mcvv_start
      UNION SELECT bezec_id, rok FROM mcvv_prihlaska_radek`),
    prisma.result.groupBy({ by: ["runnerId"], _count: { _all: true } }),
  ]);
  const years = new Map<string, number[]>();
  for (const row of yearRows) {
    const list = years.get(row.id) ?? [];
    list.push(Number(row.rok));
    years.set(row.id, list);
  }
  const results = new Map(resultRows.map((row) => [row.runnerId, row._count._all]));
  return runners.map((runner) => ({
    id: runner.id,
    name: runner.name,
    years: (years.get(runner.id) ?? []).sort((a, b) => b - a),
    results: results.get(runner.id) ?? 0,
  }));
}

export async function loadRunnerMergeHistory(): Promise<RunnerMergeHistoryEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { action: "runner.merge" },
    orderBy: { id: "desc" },
    take: RUNNER_MERGE_HISTORY_LIMIT,
    select: { id: true, createdAt: true, actorEmail: true, target: true, detail: true },
  });
  return rows.map((row) => runnerMergeHistoryEntry({ ...row, loggedAt: row.createdAt }));
}
