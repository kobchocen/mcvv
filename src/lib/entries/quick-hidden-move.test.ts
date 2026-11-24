import assert from "node:assert/strict";
import { test } from "node:test";

import { moveQuickHidden } from "./quick-hidden-move";

type Row = { userId: number; runnerId: string; createdAt: Date };

function fakeDb(rows: Row[]) {
  const db = {
    userQuickHidden: {
      findMany: async ({ where }: { where: { runnerId: string } }) =>
        rows.filter((row) => row.runnerId === where.runnerId),
      createMany: async ({ data }: { data: Row[]; skipDuplicates: boolean }) => {
        let count = 0;
        for (const row of data) {
          if (!rows.some((r) => r.userId === row.userId && r.runnerId === row.runnerId)) {
            rows.push(row);
            count++;
          }
        }
        return { count };
      },
      deleteMany: async ({ where }: { where: { runnerId: string } }) => {
        const before = rows.length;
        rows.splice(0, rows.length, ...rows.filter((row) => row.runnerId !== where.runnerId));
        return { count: before - rows.length };
      },
    },
  };
  return db as unknown as Parameters<typeof moveQuickHidden>[0];
}

test("merge / rekey moves hidden quick-add rows to the new runner id without duplicates", async () => {
  const at = new Date("2026-11-01T10:00:00Z");
  const rows: Row[] = [
    { userId: 1, runnerId: "20060012", createdAt: at },
    { userId: 2, runnerId: "20060012", createdAt: at },
    { userId: 2, runnerId: "20065005", createdAt: at },
    { userId: 3, runnerId: "19800025", createdAt: at },
  ];
  const moved = await moveQuickHidden(fakeDb(rows), "20060012", "20065005");
  assert.equal(moved, 2);
  assert.deepEqual(rows.map((row) => `${row.userId}:${row.runnerId}`).sort(), [
    "1:20065005",
    "2:20065005",
    "3:19800025",
  ]);
  assert.equal(await moveQuickHidden(fakeDb(rows), "29990001", "20065005"), 0);
});
