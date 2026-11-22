/**
 * Integration test of concurrent late bib assignment (`assignLateBibs`) against a real MariaDB.
 * Skipped unless CLUB_MERGE_DB_URL points to a throwaway database (name mcvv_tmp_* or *_test)
 * with all migrations applied (same variable as the other *.db.test.ts). Its rows use edition 2094,
 * categories '^' and '`' and runner ids 2094…, and are removed after; the startlist flags are
 * restored.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { databaseOptions } from "@/lib/db/options";
import { STARTLIST_DRAWN_KEY, STARTLIST_PUBLISHED_KEY } from "@/lib/settings/site-core";

const url = process.env.CLUB_MERGE_DB_URL;
const throwaway = url ? /\/(mcvv_tmp_\w+|\w+_test)$/.test(new URL(url).pathname) : false;
const skip = !url ? "CLUB_MERGE_DB_URL not set" : !throwaway ? "not a throwaway database" : false;

const YEAR = 2094;
const MEN = "^";
const WOMEN = "`";
const CLUB = "ZLB";
const REGS = 8;
const PER = 2;
const LOCK = "mcvv_late_bib";

const runnerId = (n: number) => `${YEAR}${String(n).padStart(4, "0")}`;

describe("late bib assignment under concurrency (database)", { skip }, () => {
  let db: PrismaClient;
  let assignLateBibs: typeof import("./late-paid").assignLateBibs;
  let savedFlags: { key: string; text: string }[] = [];

  before(async () => {
    db = new PrismaClient({
      adapter: new PrismaMariaDb(databaseOptions({ DATABASE_URL: url, NODE_ENV: "test" })),
    });
    // late-paid uses the shared client (`@/lib/db/client` takes `global.prisma` when set).
    globalThis.prisma = db;
    ({ assignLateBibs } = await import("./late-paid"));
    await cleanup();
    savedFlags = await db.setting.findMany({
      where: { key: { in: [STARTLIST_DRAWN_KEY, STARTLIST_PUBLISHED_KEY] } },
    });
    await db.setting.upsert({
      where: { key: STARTLIST_DRAWN_KEY },
      update: { text: String(YEAR) },
      create: { key: STARTLIST_DRAWN_KEY, text: String(YEAR) },
    });
    // Window 400–417 for men: champion 400 (edition default), 401 taken → exactly 16 free bibs.
    await db.category.createMany({
      data: [
        {
          id: MEN,
          name: "T muži",
          age: 0,
          sort: 98,
          sex: "M",
          record: 0,
          entryFee: 0,
          bibFrom: 400,
          bibTo: 417,
        },
        {
          id: WOMEN,
          name: "T ženy",
          age: 0,
          sort: 99,
          sex: "F",
          record: 0,
          entryFee: 0,
          bibFrom: 902,
          bibTo: 903,
        },
      ],
    });
    await db.edition.create({ data: { date: new Date(`${YEAR}-12-06`) } });
    await db.club.create({ data: { id: CLUB, year: YEAR, name: "Test" } });
    const lines: { registrationId: number; runner: number; categoryId: string; bib?: number }[] = [
      { registrationId: 100, runner: 1, categoryId: MEN, bib: 401 },
      { registrationId: 200, runner: 2, categoryId: WOMEN },
      { registrationId: 201, runner: 3, categoryId: WOMEN },
      { registrationId: 201, runner: 4, categoryId: WOMEN },
    ];
    for (let reg = 1; reg <= REGS; reg += 1) {
      for (let i = 0; i < PER; i += 1) {
        lines.push({ registrationId: reg, runner: 10 + reg * PER + i, categoryId: MEN });
      }
    }
    await db.registration.createMany({
      data: [...new Set(lines.map((line) => line.registrationId))].map((id) => ({
        year: YEAR,
        id,
      })),
    });
    await db.runner.createMany({
      data: lines.map((line) => ({ id: runnerId(line.runner), name: `Test ${line.runner}` })),
    });
    await db.registrationLine.createMany({
      data: lines.map((line) => ({
        year: YEAR,
        runnerId: runnerId(line.runner),
        registrationId: line.registrationId,
        categoryId: line.categoryId,
        clubId: CLUB,
        bib: line.bib ?? null,
      })),
    });
  });

  after(async () => {
    if (!db) return;
    await cleanup();
    for (const key of [STARTLIST_DRAWN_KEY, STARTLIST_PUBLISHED_KEY]) {
      const saved = savedFlags.find((flag) => flag.key === key);
      if (saved) await db.setting.update({ where: { key }, data: { text: saved.text } });
      else await db.setting.deleteMany({ where: { key } });
    }
    await db.$disconnect();
  });

  async function cleanup() {
    await db.auditLog.deleteMany({ where: { target: { startsWith: `startlist:${YEAR}/` } } });
    await db.mailQueue.deleteMany({
      where: { dedupeKey: { startsWith: `alert:late-bib:${YEAR}:` } },
    });
    await db.startLineMeta.deleteMany({ where: { year: YEAR } });
    await db.registrationLine.deleteMany({ where: { year: YEAR } });
    await db.registration.deleteMany({ where: { year: YEAR } });
    await db.runner.deleteMany({ where: { id: { startsWith: String(YEAR) } } });
    await db.club.deleteMany({ where: { year: YEAR } });
    await db.edition.deleteMany({
      where: { date: { gte: new Date(`${YEAR}-01-01`), lt: new Date(`${YEAR + 1}-01-01`) } },
    });
    await db.category.deleteMany({ where: { id: { in: [MEN, WOMEN] } } });
  }

  async function bibs(): Promise<number[]> {
    const rows = await db.registrationLine.findMany({
      where: { year: YEAR },
      select: { bib: true },
    });
    return rows.map((row) => row.bib).filter((bib): bib is number => bib != null && bib > 0);
  }

  const duplicates = (list: number[]) => list.filter((bib, i) => list.indexOf(bib) !== i);

  it("concurrent payments (and a repeated confirmation) never share a bib", async () => {
    const ids = [...Array.from({ length: REGS }, (_, i) => i + 1), 1];
    const settled = await Promise.allSettled(ids.map((id) => assignLateBibs(YEAR, id)));
    assert.deepEqual(
      settled.filter((s) => s.status === "rejected"),
      [],
    );
    const men = (await bibs()).filter((bib) => bib < 900);
    assert.deepEqual(duplicates(men), []);
    assert.equal(men.length, REGS * PER + 1);
    assert.ok(!men.includes(400), "champion bib stays free");
    assert.equal(
      await db.auditLog.count({
        where: { action: "startlist.bib_set", target: { startsWith: `startlist:${YEAR}/` } },
      }),
      REGS * PER,
      "every runner is assigned exactly once",
    );
  });

  it("waits for a payment that released the lock but has not committed yet", async () => {
    let released!: () => void;
    const lockReleased = new Promise<void>((resolve) => (released = resolve));
    // Competing assignment: takes 902 under the lock, releases it and commits 1 s later
    // (exactly what assignLateBibs itself does – RELEASE_LOCK runs before COMMIT).
    const competitor = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT GET_LOCK(${LOCK}, 10) AS ok`;
        await tx.registrationLine.update({
          where: { year_runnerId: { year: YEAR, runnerId: runnerId(2) } },
          data: { bib: 902 },
        });
        await tx.$queryRaw`SELECT RELEASE_LOCK(${LOCK})`;
        released();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      },
      { timeout: 20_000 },
    );
    await lockReleased;
    const result = await assignLateBibs(YEAR, 201);
    await competitor;
    assert.equal(result.assigned.length, 2);
    assert.ok(!result.assigned.some((row) => row.bib === 902), JSON.stringify(result.assigned));
    assert.deepEqual(duplicates(await bibs()), []);
  });
});
