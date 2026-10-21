import type { Prisma, PrismaClient } from "@prisma/client";

import { buildSexChangePlan, birthYearOf, type SexChangePlan } from "@/lib/admin/runner-sex-core";

/** Models re-pointed to the new runner id by the sex change. */
export const RUNNER_REKEYED_MODELS = [
  "RegistrationLine",
  "StartEntry",
  "RunnerPhoto",
  "WebImage",
  "StartLineMeta",
] as const;

/**
 * History that must never change: a runner with any result (mcvv_time) cannot change sex,
 * so these models are only read (guard), never written.
 */
export const RUNNER_HISTORY_MODELS = ["Result"] as const;

/**
 * Every model that references cis_bezec.id (checked against the Prisma schema in
 * runner-sex.test.ts, so a new reference cannot be forgotten).
 */
export const RUNNER_REFERENCE_MODELS = [...RUNNER_REKEYED_MODELS, ...RUNNER_HISTORY_MODELS];

export type SexChangeCounts = {
  registrationLines: number;
  startEntries: number;
  runnerPhotos: number;
  webImages: number;
  /** Zámek / skupina na startovce (mcvv_start_radek). */
  startLines: number;
};

export type SexChangeOutcome = SexChangePlan & { counts: SexChangeCounts };

export class SexChangeError extends Error {
  constructor(public readonly code: "not_found" | "invalid_id" | "collision" | "has_results") {
    super(`Runner sex change failed: ${code}`);
    this.name = "SexChangeError";
  }
}

type Tx = Prisma.TransactionClient;

/** Newcomers only: any result of the runner means history, which must never be rewritten. */
async function assertNoResults(tx: Tx, runnerId: string): Promise<void> {
  if ((await tx.result.count({ where: { runnerId } })) > 0) {
    throw new SexChangeError("has_results");
  }
}

async function loadPlan(
  tx: Tx,
  runnerId: string,
  currentYear: number,
): Promise<{
  plan: SexChangePlan;
  runner: { name: string; created: Date | null; author: string | null };
}> {
  if (!/^\d{8}$/.test(runnerId)) {
    throw new SexChangeError("invalid_id");
  }
  const runner = await tx.runner.findUnique({
    where: { id: runnerId },
    select: { id: true, name: true, created: true, author: true },
  });
  if (!runner) {
    throw new SexChangeError("not_found");
  }
  await assertNoResults(tx, runnerId);
  const yearPrefix = String(birthYearOf(runnerId));
  const byPrefix = { runnerId: { startsWith: yearPrefix } };
  const own = { runnerId };
  // Ids of the birth year: master data plus ids still referenced anywhere (orphans, incl.
  // results – read only, so a new id never collides with history).
  const taken = new Set<string>();
  for (const row of await tx.runner.findMany({
    where: { id: { startsWith: yearPrefix } },
    select: { id: true },
  })) {
    taken.add(row.id);
  }
  const refLists = [
    await tx.registrationLine.findMany({
      where: byPrefix,
      select: { runnerId: true },
      distinct: ["runnerId"],
    }),
    await tx.startEntry.findMany({
      where: byPrefix,
      select: { runnerId: true },
      distinct: ["runnerId"],
    }),
    await tx.result.findMany({
      where: byPrefix,
      select: { runnerId: true },
      distinct: ["runnerId"],
    }),
    await tx.runnerPhoto.findMany({
      where: byPrefix,
      select: { runnerId: true },
      distinct: ["runnerId"],
    }),
    await tx.webImage.findMany({
      where: byPrefix,
      select: { runnerId: true },
      distinct: ["runnerId"],
    }),
  ];
  for (const list of refLists) {
    for (const row of list) {
      if (row.runnerId) taken.add(row.runnerId);
    }
  }

  const lines = await tx.registrationLine.findMany({
    where: own,
    select: { year: true, registrationId: true, categoryId: true, entryFee: true },
  });
  const starts = await tx.startEntry.findMany({
    where: own,
    select: { year: true, categoryId: true },
  });
  const photos = await tx.runnerPhoto.count({ where: own });
  const webImages = await tx.webImage.count({ where: own });
  const categories = await tx.category.findMany({
    select: { id: true, name: true, sex: true, age: true, entryFee: true },
  });

  const plan = buildSexChangePlan({
    runner: { id: runner.id, name: runner.name },
    takenIds: taken,
    lines,
    starts,
    photos,
    webImages,
    categories,
    currentYear,
  });
  return { plan, runner };
}

/** Preview for the confirmation dialog (read-only). */
export async function previewSexChange(
  client: PrismaClient,
  runnerId: string,
  currentYear: number,
): Promise<SexChangePlan> {
  return (await loadPlan(client, runnerId, currentYear)).plan;
}

/**
 * Flips the runner's sex in ONE transaction: creates the runner under a new id (next free id
 * of the birth year for the other sex), re-points registration lines, start list (incl. lock /
 * group meta), photo tags and web images, recalculates categories (and the fee of the current year's lines) and
 * deletes the old id. Only for newcomers: rejected with `has_results` when the runner has any
 * result; mcvv_time is never written.
 */
export async function applySexChange(
  client: PrismaClient,
  args: { runnerId: string; currentYear: number },
): Promise<SexChangeOutcome> {
  return client.$transaction(
    async (tx) => {
      const { plan, runner } = await loadPlan(tx, args.runnerId, args.currentYear);
      const { oldId, newId } = plan;
      if (await tx.runner.findUnique({ where: { id: newId }, select: { id: true } })) {
        throw new SexChangeError("collision");
      }
      await tx.runner.create({
        data: { id: newId, name: runner.name, created: runner.created, author: runner.author },
      });
      const from = { where: { runnerId: oldId }, data: { runnerId: newId } };
      const counts: SexChangeCounts = {
        registrationLines: (await tx.registrationLine.updateMany(from)).count,
        startEntries: (await tx.startEntry.updateMany(from)).count,
        runnerPhotos: (await tx.runnerPhoto.updateMany(from)).count,
        webImages: (await tx.webImage.updateMany(from)).count,
        startLines: (await tx.startLineMeta.updateMany(from)).count,
      };
      for (const line of plan.lines) {
        if (!line.newCategory) continue;
        await tx.registrationLine.update({
          where: { year_runnerId: { year: line.year, runnerId: newId } },
          data: {
            categoryId: line.newCategory.id,
            ...(line.feeChanged ? { entryFee: line.newFee } : {}),
          },
        });
      }
      for (const start of plan.starts) {
        if (!start.newCategory) continue;
        await tx.startEntry.update({
          where: { year_runnerId: { year: start.year, runnerId: newId } },
          data: { categoryId: start.newCategory.id },
        });
      }
      // Re-check right before the old id disappears (a result written meanwhile → roll back).
      await assertNoResults(tx, oldId);
      await tx.runner.delete({ where: { id: oldId } });
      return { ...plan, counts };
    },
    { maxWait: 5_000, timeout: 30_000 },
  );
}
