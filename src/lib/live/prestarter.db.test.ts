/**
 * Integration test of the pre-starter (#379) against a real MariaDB: the new `prestarter` role
 * value, a secondary pre-starter grant, and start marks shared with the starter (same
 * `mcvv_start_check` row, same priority, the later tap wins, admin always wins).
 * Skipped unless CLUB_MERGE_DB_URL points to a throwaway database (name mcvv_tmp_* or *_test)
 * with all migrations applied. Rows use edition 2093, category '~' and runner ids 2093…, and
 * are removed after.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { databaseOptions } from "@/lib/db/options";

import { hasPrestarterRole, hasStartCorridorRole } from "./prestarter-core";
import type { StarterPlan } from "./starter";

const url = process.env.CLUB_MERGE_DB_URL;
const throwaway = url ? /\/(mcvv_tmp_\w+|\w+_test)$/.test(new URL(url).pathname) : false;
const skip = !url ? "CLUB_MERGE_DB_URL not set" : !throwaway ? "not a throwaway database" : false;

const YEAR = 2093;
const CAT = "~";
const CLUB = "PRS";
const MARK = "prestarter-test@example.invalid";
const runnerId = (n: number) => `${YEAR}${String(n).padStart(4, "0")}`;

describe("pre-starter role and shared start marks (database)", { skip }, () => {
  let db: PrismaClient;
  let starter: typeof import("./starter");
  const ids: Record<string, number> = {};
  // Start far ahead: every tap below is "before the start" (mark / unmark).
  const plan: StarterPlan = {
    year: YEAR,
    zero: new Date(Date.now() + 3_600_000),
    intervalS: 15,
    secondStartFrom: 601,
    organizerShiftSeconds: 0,
  };

  before(async () => {
    db = new PrismaClient({
      adapter: new PrismaMariaDb(databaseOptions({ DATABASE_URL: url, NODE_ENV: "test" })),
    });
    globalThis.prisma = db;
    starter = await import("./starter");
    await cleanup();

    await db.category.create({
      data: {
        id: CAT,
        name: "T předstart",
        age: 0,
        sort: 97,
        sex: "M",
        record: 0,
        entryFee: 0,
        bibFrom: 1,
        bibTo: 999,
      },
    });
    await db.club.create({ data: { id: CLUB, year: YEAR, name: "Test" } });
    await db.registration.create({ data: { year: YEAR, id: 1 } });
    const bibs = [5, 6, 7, 8, 9, 601];
    await db.runner.createMany({
      data: bibs.map((bib) => ({ id: runnerId(bib), name: `Test ${bib}` })),
    });
    await db.registrationLine.createMany({
      data: bibs.map((bib) => ({
        year: YEAR,
        runnerId: runnerId(bib),
        registrationId: 1,
        categoryId: CAT,
        clubId: CLUB,
        bib,
        entryFee: 0,
      })),
    });

    const hash = (n: number) => `testhash-prestarter-${n}`.padEnd(60, "x");
    const pre = await db.user.create({
      data: {
        email: `pre+${MARK}`,
        passwordHash: hash(1),
        name: "Petra Předstartér",
        role: "prestarter",
        emailVerified: new Date(),
        startCorridor: 1,
        roleGrants: { create: { role: "prestarter" } },
      },
    });
    ids.pre = pre.id;
    const both = await db.user.create({
      data: {
        email: `both+${MARK}`,
        passwordHash: hash(2),
        name: "Bára Startér + Předstartér",
        role: "starter",
        emailVerified: new Date(),
        startCorridor: 1,
        roleGrants: { createMany: { data: [{ role: "starter" }, { role: "prestarter" }] } },
      },
    });
    ids.both = both.id;
    const st = await db.user.create({
      data: {
        email: `st+${MARK}`,
        passwordHash: hash(3),
        name: "Standa Startér",
        role: "starter",
        emailVerified: new Date(),
        startCorridor: 1,
        roleGrants: { create: { role: "starter" } },
      },
    });
    ids.st = st.id;
  });

  after(async () => {
    if (!db) return;
    await cleanup();
    await db.$disconnect();
  });

  async function cleanup() {
    await db.startCheckEntry.deleteMany({ where: { year: YEAR } });
    await db.startCheck.deleteMany({ where: { year: YEAR } });
    await db.registrationLine.deleteMany({ where: { year: YEAR } });
    await db.registration.deleteMany({ where: { year: YEAR } });
    await db.runner.deleteMany({ where: { id: { startsWith: String(YEAR) } } });
    await db.club.deleteMany({ where: { year: YEAR } });
    await db.category.deleteMany({ where: { id: CAT } });
    await db.user.deleteMany({ where: { email: { contains: MARK } } });
  }

  const tap = (bib: number, action: "mark" | "unmark" | "ontime" | "late", at: number) => ({
    id: randomUUID(),
    bib,
    action,
    at,
  });

  it("stores the prestarter role value and detects primary and secondary roles", async () => {
    const users = await db.user.findMany({
      where: { email: { contains: MARK } },
      select: { email: true, role: true, roleGrants: { select: { role: true } } },
      orderBy: { id: "asc" },
    });
    const byEmail = new Map(users.map((user) => [user.email.split("+")[0], user]));
    const pre = byEmail.get("pre")!;
    const both = byEmail.get("both")!;
    const st = byEmail.get("st")!;
    assert.equal(pre.role, "prestarter");
    const grants = (u: typeof pre) => u.roleGrants.map((row) => row.role);
    assert.equal(hasPrestarterRole(pre.role, grants(pre)), true);
    assert.equal(hasPrestarterRole(both.role, grants(both)), true, "secondary grant counts");
    assert.equal(hasPrestarterRole(st.role, grants(st)), false);
    assert.equal(hasStartCorridorRole(st.role, grants(st)), true);
  });

  it("writes the same start row as the starter with source prestart and the user", async () => {
    const now = Date.now();
    const [result] = await starter.applyStarterEntries(
      [tap(5, "mark", now - 1000)],
      plan,
      { id: ids.pre },
      1,
      new Date(now),
      starter.PRESTARTER_SOURCE,
    );
    assert.equal(result?.outcome, "applied");
    const row = await db.startCheck.findUnique({ where: { year_bib: { year: YEAR, bib: 5 } } });
    assert.equal(row?.source, "prestart");
    assert.equal(row?.userId, ids.pre);
    assert.equal(row?.corridor, 1);
    const journal = await db.startCheckEntry.findFirst({ where: { year: YEAR, bib: 5 } });
    assert.equal(journal?.source, "prestart", "audit keeps the pre-starter as the source");
    assert.equal(journal?.userId, ids.pre, "audit keeps who tapped");
  });

  it("the later tap wins between starter and pre-starter (same priority)", async () => {
    const now = Date.now();
    // starter taps later → takes the row over
    let [r] = await starter.applyStarterEntries(
      [tap(5, "mark", now - 500)],
      plan,
      { id: ids.st },
      1,
      new Date(now),
    );
    assert.equal(r?.outcome, "applied");
    assert.equal(r?.note, "over=prestart");
    let row = await db.startCheck.findUnique({ where: { year_bib: { year: YEAR, bib: 5 } } });
    assert.equal(row?.source, "starter");
    // pre-starter's offline unmark tapped before that → ignored
    [r] = await starter.applyStarterEntries(
      [tap(5, "unmark", now - 800)],
      plan,
      { id: ids.pre },
      1,
      new Date(now),
      starter.PRESTARTER_SOURCE,
    );
    assert.equal(r?.outcome, "ignored");
    // pre-starter's unmark tapped after → deletes the starter's mark
    [r] = await starter.applyStarterEntries(
      [tap(5, "unmark", now - 100)],
      plan,
      { id: ids.pre },
      1,
      new Date(now),
      starter.PRESTARTER_SOURCE,
    );
    assert.equal(r?.outcome, "deleted");
    row = await db.startCheck.findUnique({ where: { year_bib: { year: YEAR, bib: 5 } } });
    assert.equal(row, null);
  });

  it("never overrides an admin record", async () => {
    const now = Date.now();
    await db.startCheck.create({
      data: {
        year: YEAR,
        bib: 6,
        startedAt: new Date(now),
        source: "admin",
        userId: null,
        markedAt: null,
        corridor: 1,
      },
    });
    const [r] = await starter.applyStarterEntries(
      [tap(6, "mark", now)],
      plan,
      { id: ids.pre },
      1,
      new Date(now),
      starter.PRESTARTER_SOURCE,
    );
    assert.equal(r?.outcome, "ignored");
    const row = await db.startCheck.findUnique({ where: { year_bib: { year: YEAR, bib: 6 } } });
    assert.equal(row?.source, "admin");
  });

  it("rejects a bib outside the pre-starter's corridor", async () => {
    const now = Date.now();
    const [r] = await starter.applyStarterEntries(
      [tap(601, "mark", now)],
      plan,
      { id: ids.pre },
      1,
      new Date(now),
      starter.PRESTARTER_SOURCE,
    );
    assert.equal(r?.outcome, "rejected");
    assert.equal(r?.note, "corridor=2");
    const row = await db.startCheck.findUnique({ where: { year_bib: { year: YEAR, bib: 601 } } });
    assert.equal(row, null);
  });

  it("confirms a late start like the starter (Pavel 27. 11.: smí všechno jako startér)", async () => {
    const now = Date.now();
    const past = { ...plan, zero: new Date(now - 3_600_000) };
    const [r] = await starter.applyStarterEntries(
      [tap(8, "late", now - 200)],
      past,
      { id: ids.pre },
      1,
      new Date(now),
      starter.PRESTARTER_SOURCE,
    );
    assert.equal(r?.outcome, "applied");
    const row = await db.startCheck.findUnique({ where: { year_bib: { year: YEAR, bib: 8 } } });
    assert.equal(row?.source, "prestart");
    assert.equal(row?.late, true);
    assert.ok(row?.realStartAt, "real start time is stored for information");
    const planned = past.zero.getTime() + 7 * 15_000;
    assert.equal(row?.startedAt.getTime(), planned, "results still use the planned start");
  });

  it("takes over a split auto-mark and a starter's mark when tapping later", async () => {
    const now = Date.now();
    await db.startCheck.create({
      data: {
        year: YEAR,
        bib: 9,
        startedAt: new Date(now),
        source: "split",
        notMarked: true,
        corridor: 1,
      },
    });
    const past = { ...plan, zero: new Date(now - 3_600_000) };
    let [r] = await starter.applyStarterEntries(
      [tap(9, "late", now - 300)],
      past,
      { id: ids.st },
      1,
      new Date(now),
    );
    assert.equal(r?.outcome, "applied");
    [r] = await starter.applyStarterEntries(
      [tap(9, "late", now - 100)],
      past,
      { id: ids.pre },
      1,
      new Date(now),
      starter.PRESTARTER_SOURCE,
    );
    assert.equal(r?.outcome, "applied");
    const row = await db.startCheck.findUnique({ where: { year_bib: { year: YEAR, bib: 9 } } });
    assert.equal(row?.source, "prestart");
    assert.equal(row?.userId, ids.pre);
    assert.equal(row?.notMarked, false);
  });

  it("loads the snapshot with pre-starter marks for the starter screen", async () => {
    const now = Date.now();
    await starter.applyStarterEntries(
      [tap(7, "mark", now)],
      plan,
      { id: ids.both },
      1,
      new Date(now),
      starter.PRESTARTER_SOURCE,
    );
    const snapshot = await starter.loadStarterSnapshot({ ...plan, zeroOverridden: false }, 1);
    assert.deepEqual(
      snapshot.runners.map((runner) => runner.bib),
      [5, 6, 7, 8, 9],
    );
    const mark = snapshot.marks.find((item) => item.bib === 7);
    assert.equal(mark?.source, "prestart");
  });
});
