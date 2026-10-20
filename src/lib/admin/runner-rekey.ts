import type { Prisma, PrismaClient } from "@prisma/client";

import { buildSexChangePlan, birthYearOf, type SexChangePlan } from "@/lib/admin/runner-sex-core";

/**
 * Every model that references cis_bezec.id (checked against the Prisma schema in
 * runner-rekey.test.ts, so a new reference cannot be forgotten).
 */
export const RUNNER_REFERENCE_MODELS = [
  "RegistrationLine",
  "StartEntry",
  "Result",
  "RunnerPhoto",
  "WebImage",
] as const;

export type SexChangeCounts = {
  registrationLines: number;
  startEntries: number;
  results: number;
  runnerPhotos: number;
  webImages: number;
};

export type SexChangeOutcome = SexChangePlan & { counts: SexChangeCounts };

export class SexChangeError extends Error {
  constructor(public readonly code: "not_found" | "invalid_id" | "collision") {
    super(`Runner sex change failed: ${code}`);
    this.name = "SexChangeError";
  }
}

type Tx = Prisma.TransactionClient;

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
  const yearPrefix = String(birthYearOf(runnerId));
  const byPrefix = { runnerId: { startsWith: yearPrefix } };
  const own = { runnerId };
  // Ids of the birth year: master data plus ids still referenced anywhere (orphans).
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
  const results = await tx.result.findMany({
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
    results,
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
 * of the birth year for the other sex), re-points every reference (registration lines, start
 * list, results, photo tags, web images), recalculates categories (and the fee of the current
 * year's lines), optionally the categories of historical results, and deletes the old id.
 */
export async function applySexChange(
  client: PrismaClient,
  args: { runnerId: string; currentYear: number; recategorizeResults: boolean },
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
        results: (await tx.result.updateMany(from)).count,
        runnerPhotos: (await tx.runnerPhoto.updateMany(from)).count,
        webImages: (await tx.webImage.updateMany(from)).count,
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
      if (args.recategorizeResults) {
        for (const result of plan.results) {
          if (!result.newCategory) continue;
          await tx.result.update({
            where: { year_runnerId: { year: result.year, runnerId: newId } },
            data: { categoryId: result.newCategory.id },
          });
        }
      }
      await tx.runner.delete({ where: { id: oldId } });
      return { ...plan, counts };
    },
    { maxWait: 5_000, timeout: 30_000 },
  );
}
