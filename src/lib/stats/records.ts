import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { clearRecordBaselines } from "@/lib/live/records-live";

import { recordChanges, type RecordChange } from "./records-core";

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * Přepočítá `cis_mcvv_kateg.rekord` ze všech výsledků (`mcvv_time`) a zapíše jen změny.
 * Volá se po importu výsledků (v téže transakci) a ručně z číselníku kategorií.
 */
export async function recalculateCategoryRecords(db: Db = prisma): Promise<RecordChange[]> {
  const [categories, results] = await Promise.all([
    db.category.findMany({ select: { id: true, sex: true, age: true, record: true } }),
    db.result.findMany({ select: { year: true, runnerId: true, time: true } }),
  ]);
  const changes = recordChanges(categories, results);
  for (const change of changes) {
    await db.category.update({ where: { id: change.id }, data: { record: change.to } });
  }
  // živé TR (držitel, rok) se na téhle replice načtou znovu; ostatní do 10 min
  clearRecordBaselines();
  return changes;
}
