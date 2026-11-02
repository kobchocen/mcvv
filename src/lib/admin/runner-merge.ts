/**
 * Sloučení duplicitních běžců (#261) – načtení obou stran, náhled a zápis v jedné transakci.
 * Čistá logika (konflikty, počty, varování) je v `runner-merge-core.ts`.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import {
  planRunnerMerge,
  type RunnerMergeResult,
  type RunnerMergeRow,
  type RunnerMergeSide,
} from "@/lib/admin/runner-merge-core";
import type { AuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/log";

type Db = PrismaClient | Prisma.TransactionClient;

const RUNNER_ID = /^\d{8}$/;

/** Všechny řádky odkazující na běžce (bez blobů obrázků). */
async function loadReferences(db: Db, runnerId: string) {
  const [lines, starts, results, startLines, specials, partners, photos, images] =
    await Promise.all([
      db.registrationLine.findMany({ where: { runnerId }, orderBy: { year: "asc" } }),
      db.startEntry.findMany({ where: { runnerId }, orderBy: { year: "asc" } }),
      db.result.findMany({ where: { runnerId }, orderBy: { year: "asc" } }),
      db.startLineMeta.findMany({ where: { runnerId }, orderBy: { year: "asc" } }),
      db.specialStart.findMany({ where: { runnerId }, orderBy: { year: "asc" } }),
      db.specialStart.findMany({ where: { partnerId: runnerId }, orderBy: { year: "asc" } }),
      db.runnerPhoto.findMany({ where: { runnerId }, orderBy: { photoId: "asc" } }),
      db.webImage.findMany({
        where: { runnerId },
        select: { id: true, typeId: true, runnerId: true, desc: true, year: true },
        orderBy: { id: "asc" },
      }),
    ]);
  return { lines, starts, results, startLines, specials, partners, photos, images };
}

type References = Awaited<ReturnType<typeof loadReferences>>;

function referenceRows(refs: References): RunnerMergeRow[] {
  const byYear = (table: RunnerMergeRow["table"], rows: { year: number }[]) =>
    rows.map((row) => ({ table, year: row.year, key: String(row.year) }));
  return [
    ...refs.lines.map((row) => ({
      table: "mcvv_prihlaska_radek" as const,
      year: row.year,
      key: String(row.registrationId),
    })),
    ...byYear("mcvv_start", refs.starts),
    ...byYear("mcvv_time", refs.results),
    ...byYear("mcvv_start_radek", refs.startLines),
    ...byYear("mcvv_spec_start", refs.specials),
    ...byYear("mcvv_spec_start_partner", refs.partners),
    ...refs.photos.map((row) => ({
      table: "mcvv_bezec_fotka" as const,
      year: null,
      key: String(row.photoId),
    })),
    ...refs.images.map((row) => ({
      table: "webimages" as const,
      year: row.year,
      key: String(row.id),
    })),
  ];
}

async function loadSide(
  db: Db,
  runnerId: string,
): Promise<{ side: RunnerMergeSide; refs: References; runner: Prisma.JsonObject } | null> {
  if (!RUNNER_ID.test(runnerId)) return null;
  const runner = await db.runner.findUnique({ where: { id: runnerId } });
  if (!runner) return null;
  const refs = await loadReferences(db, runnerId);
  return {
    side: {
      id: runner.id,
      name: runner.name,
      nationality: runner.nationality,
      rows: referenceRows(refs),
    },
    refs,
    runner: json(runner) as Prisma.JsonObject,
  };
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export type RunnerMergePreview = RunnerMergeResult & {
  main: RunnerMergeSide | null;
  other: RunnerMergeSide | null;
};

/** Náhled bez zápisu. */
export async function previewRunnerMerge(
  db: Db,
  mainId: string,
  otherId: string,
): Promise<RunnerMergePreview> {
  const [main, other] = await Promise.all([loadSide(db, mainId), loadSide(db, otherId)]);
  const result = planRunnerMerge(main?.side ?? null, other?.side ?? null);
  return { ...result, main: main?.side ?? null, other: other?.side ?? null };
}

/**
 * Sloučení v jedné transakci: zámky obou běžců, všechny odkazy slučovaného → hlavní,
 * smazání slučovaného z `cis_bezec` a audit `runner.merge` s úplným stavem před sloučením
 * (řádek běžce + všechny přepsané / smazané řádky) pro ruční obnovu.
 */
export async function applyRunnerMerge(
  prisma: PrismaClient,
  mainId: string,
  otherId: string,
  actor: AuditActor,
): Promise<RunnerMergeResult> {
  return prisma.$transaction(async (tx) => {
    const ids = [mainId, otherId].filter((id) => RUNNER_ID.test(id)).sort();
    if (ids.length === 2) {
      await tx.$queryRaw`SELECT id FROM cis_bezec WHERE id IN (${ids[0]}, ${ids[1]}) ORDER BY id FOR UPDATE`;
    }
    const [main, other] = await Promise.all([loadSide(tx, mainId), loadSide(tx, otherId)]);
    const result = planRunnerMerge(main?.side ?? null, other?.side ?? null);
    if (!result.ok || !main || !other) return result;
    const { plan } = result;
    const from = { runnerId: otherId };
    const to = { runnerId: mainId };

    const dropped = plan.droppedPhotoTags.map((row) => Number(row.key));
    if (dropped.length) {
      await tx.runnerPhoto.deleteMany({ where: { runnerId: otherId, photoId: { in: dropped } } });
    }
    await tx.runnerPhoto.updateMany({ where: from, data: to });
    await tx.webImage.updateMany({ where: from, data: to });
    await tx.registrationLine.updateMany({ where: from, data: to });
    await tx.startEntry.updateMany({ where: from, data: to });
    await tx.result.updateMany({ where: from, data: to });
    await tx.startLineMeta.updateMany({ where: from, data: to });
    await tx.specialStart.updateMany({ where: from, data: to });
    await tx.specialStart.updateMany({
      where: { partnerId: otherId },
      data: { partnerId: mainId },
    });
    if (plan.nationality) {
      await tx.runner.update({ where: { id: mainId }, data: { nationality: plan.nationality } });
    }
    await tx.runner.delete({ where: { id: otherId } });

    await writeAudit(
      {
        actor,
        action: "runner.merge",
        target: `runner:${mainId}`,
        detail: {
          mainId,
          otherId,
          mainName: main.side.name,
          otherName: other.side.name,
          counts: plan.counts,
          droppedPhotoTags: dropped,
          warnings: plan.warnings,
          nationality: plan.nationality,
          // Úplný stav před sloučením (Q253): smazaný běžec a všechny jeho řádky.
          before: {
            runner: other.runner,
            mainNationality: main.side.nationality,
            registrationLines: json(other.refs.lines),
            startEntries: json(other.refs.starts),
            results: json(other.refs.results),
            startLineMetas: json(other.refs.startLines),
            specialStarts: json(other.refs.specials),
            specialPartners: json(other.refs.partners),
            runnerPhotos: json(other.refs.photos),
            webImages: json(other.refs.images),
          },
        },
      },
      tx,
    );
    return result;
  });
}
