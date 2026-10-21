import type { SessionUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit/log";
import { recalculateCategoryRecords } from "@/lib/stats/records";
import type { RecordChange } from "@/lib/stats/records-core";
import { prisma } from "@/lib/db/client";

import {
  clubKey,
  type DictSnapshot,
  type NamedId,
  type PresentationPlan,
  type PresentationSnapshot,
  type ResultsPlan,
  type ResultsSnapshot,
} from "./obd-import";

async function loadDictSnapshot(year: number): Promise<DictSnapshot> {
  const [runners, clubs] = await Promise.all([
    prisma.runner.findMany({ select: { id: true, name: true } }),
    prisma.club.findMany({
      select: { id: true, year: true, name: true },
      orderBy: { year: "desc" },
    }),
  ]);
  const clubsThisYear = new Map<string, NamedId>();
  const clubsOtherYears = new Map<string, NamedId>();
  for (const club of clubs) {
    const key = clubKey(club.id);
    if (club.year === year) clubsThisYear.set(key, { id: club.id, name: club.name });
    else if (!clubsOtherYears.has(key)) clubsOtherYears.set(key, { id: club.id, name: club.name });
  }
  return {
    year,
    runners: new Map(runners.map((runner) => [runner.id, runner.name])),
    clubsThisYear,
    clubsOtherYears,
  };
}

export async function loadCategoryIds(): Promise<Map<string, string>> {
  const rows = await prisma.category.findMany({ select: { id: true, name: true } });
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function loadPresentationSnapshot(year: number): Promise<PresentationSnapshot> {
  const [dict, lines, start] = await Promise.all([
    loadDictSnapshot(year),
    prisma.registrationLine.findMany({ where: { year }, select: { runnerId: true, bib: true } }),
    prisma.startEntry.findMany({
      where: { year },
      select: {
        runnerId: true,
        clubId: true,
        categoryId: true,
        bib: true,
        runnerName: true,
        clubName: true,
      },
    }),
  ]);
  return {
    ...dict,
    registrationBibs: new Map(lines.map((line) => [line.runnerId, line.bib])),
    currentStart: start,
  };
}

export async function loadResultsSnapshot(year: number): Promise<ResultsSnapshot> {
  const [dict, categories, start, splits, results] = await Promise.all([
    loadDictSnapshot(year),
    loadCategoryIds(),
    prisma.startEntry.findMany({ where: { year }, select: { runnerId: true, bib: true } }),
    prisma.split.findMany({ where: { year, split: "9" }, select: { bib: true, time: true } }),
    prisma.result.findMany({
      where: { year },
      select: {
        runnerId: true,
        clubId: true,
        categoryId: true,
        time: true,
        runnerName: true,
        clubName: true,
      },
    }),
  ]);
  return {
    ...dict,
    categories,
    startBibs: new Map(start.map((row) => [row.runnerId, row.bib])),
    finishTimes: new Map(splits.map((row) => [row.bib, row.time])),
    currentResults: results,
  };
}

function authorOf(actor: SessionUser): string {
  return actor.email.slice(0, 64);
}

/** Zapíše plán importu po prezentaci v jedné transakci (vše, nebo nic). */
export async function applyPresentationPlan(
  plan: PresentationPlan,
  actor: SessionUser,
  files: Record<string, { name: string; sha256: string; rows: number } | undefined>,
): Promise<void> {
  const now = new Date();
  const author = authorOf(actor);
  await prisma.$transaction(
    async (tx) => {
      if (plan.newRunners.length > 0) {
        await tx.runner.createMany({
          data: plan.newRunners.map((row) => ({
            id: row.id,
            name: row.name,
            created: now,
            author,
          })),
        });
      }
      const clubs = [...plan.newClubs, ...plan.copiedClubs];
      if (clubs.length > 0) {
        await tx.club.createMany({
          data: clubs.map((row) => ({
            id: row.id,
            year: plan.year,
            name: row.name,
            created: now,
            author,
          })),
        });
      }
      if (plan.start && !plan.start.unchanged) {
        await tx.startEntry.deleteMany({ where: { year: plan.year } });
        if (plan.start.rows.length > 0) {
          await tx.startEntry.createMany({ data: plan.start.rows });
        }
      }
      await writeAudit(
        {
          actor,
          action: "raceday.import_presentation",
          target: `year:${plan.year}`,
          detail: {
            files,
            newRunners: plan.newRunners.length,
            newClubs: plan.newClubs.length,
            copiedClubs: plan.copiedClubs.map((club) => club.id),
            start: plan.start
              ? {
                  rows: plan.start.rows.length,
                  replaced: plan.start.replaced,
                  unchanged: plan.start.unchanged,
                }
              : null,
          },
        },
        tx,
      );
    },
    { timeout: 60_000 },
  );
}

/**
 * Přepíše výsledky ročníku (mcvv_time) v jedné transakci a v téže transakci přepočítá
 * rekordy kategorií (#129). Vrací změněné rekordy.
 */
export async function applyResultsPlan(
  plan: ResultsPlan,
  actor: SessionUser,
  file: { name: string; sha256: string; rows: number },
): Promise<RecordChange[]> {
  const now = new Date();
  const author = authorOf(actor);
  return prisma.$transaction(
    async (tx) => {
      if (plan.copiedClubs.length > 0) {
        await tx.club.createMany({
          data: plan.copiedClubs.map((row) => ({
            id: row.id,
            year: plan.year,
            name: row.name,
            created: now,
            author,
          })),
        });
      }
      if (!plan.unchanged) {
        await tx.result.deleteMany({ where: { year: plan.year } });
        if (plan.rows.length > 0) await tx.result.createMany({ data: plan.rows });
      }
      const records = await recalculateCategoryRecords(tx);
      await writeAudit(
        {
          actor,
          action: "raceday.import_results",
          target: `year:${plan.year}`,
          detail: {
            file,
            rows: plan.rows.length,
            replaced: plan.replaced,
            unchanged: plan.unchanged,
            copiedClubs: plan.copiedClubs.map((club) => club.id),
            perCategory: Object.fromEntries(plan.perCategory.map((c) => [c.categoryId, c.count])),
            records,
          },
        },
        tx,
      );
      return records;
    },
    { timeout: 60_000 },
  );
}
