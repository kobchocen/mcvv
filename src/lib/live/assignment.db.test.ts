/**
 * Integration test: list and assignment of splitmakers including a secondary
 * Mezičasy role. Skipped unless CLUB_MERGE_DB_URL points to a throwaway
 * database (name mcvv_tmp_* or *_test) with migrations applied.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { databaseOptions } from "@/lib/db/options";
import type { SessionUser } from "@/lib/auth/session";

const url = process.env.CLUB_MERGE_DB_URL;
const throwaway = url ? /\/(mcvv_tmp_\w+|\w+_test)$/.test(new URL(url).pathname) : false;
const skip = !url ? "CLUB_MERGE_DB_URL not set" : !throwaway ? "not a throwaway database" : false;

const MARK = "smroles-test@example.invalid";

function hash(n: number): string {
  return `testhash-splitmaker-roles-${n}`.padEnd(60, "x");
}

describe("listSplitmakers and saveAssignment honor a secondary Mezičasy role", { skip }, () => {
  let db: PrismaClient;
  let listSplitmakers: typeof import("./assignment").listSplitmakers;
  let saveAssignment: typeof import("./assignment").saveAssignment;
  let actor: SessionUser;
  const ids: Record<string, number> = {};

  before(async () => {
    db = new PrismaClient({
      adapter: new PrismaMariaDb(databaseOptions({ DATABASE_URL: url, NODE_ENV: "test" })),
    });
    globalThis.prisma = db;
    ({ listSplitmakers, saveAssignment } = await import("./assignment"));
    await cleanup();

    const admin = await db.user.create({
      data: {
        email: `admin+${MARK}`,
        passwordHash: hash(1),
        name: "Admin SM",
        role: "admin",
        emailVerified: new Date(),
      },
    });
    actor = { id: admin.id, email: admin.email, name: admin.name, role: "admin" };
    ids.admin = admin.id;

    const primary = await db.user.create({
      data: {
        email: `primary+${MARK}`,
        passwordHash: hash(2),
        name: "Ada Primary",
        role: "splitmaker",
        emailVerified: new Date(),
        roleGrants: { create: { role: "splitmaker" } },
      },
    });
    ids.primary = primary.id;

    const both = await db.user.create({
      data: {
        email: `both+${MARK}`,
        passwordHash: hash(3),
        name: "Bea Both",
        role: "starter",
        emailVerified: new Date(),
        roleGrants: { createMany: { data: [{ role: "starter" }, { role: "splitmaker" }] } },
      },
    });
    ids.both = both.id;

    const starterOnly = await db.user.create({
      data: {
        email: `starter+${MARK}`,
        passwordHash: hash(4),
        name: "Cyril Starter",
        role: "starter",
        emailVerified: new Date(),
        roleGrants: { create: { role: "starter" } },
      },
    });
    ids.starter = starterOnly.id;
  });

  after(async () => {
    await cleanup();
    await db.$disconnect();
  });

  async function cleanup() {
    await db.user.deleteMany({ where: { email: { contains: MARK } } });
  }

  it("lists a primary splitmaker and a starter who also has Mezičasy", async () => {
    const rows = await listSplitmakers();
    const ours = rows.filter((row) => row.email.includes(MARK));
    assert.deepEqual(
      ours.map((row) => row.email),
      [`primary+${MARK}`, `both+${MARK}`],
    );
  });

  it("assigns a station to a user whose Mezičasy role is secondary", async () => {
    assert.equal(await saveAssignment(actor, ids.both, "1"), "ok");
    assert.equal(await saveAssignment(actor, ids.both, "1"), "unchanged");
    const row = await db.user.findUnique({
      where: { id: ids.both },
      select: { splitStations: true },
    });
    assert.equal(row?.splitStations, "1");
  });

  it("rejects assignment for a starter without the Mezičasy role", async () => {
    assert.equal(await saveAssignment(actor, ids.starter, "1"), "not_found");
    const row = await db.user.findUnique({
      where: { id: ids.starter },
      select: { splitStations: true },
    });
    assert.equal(row?.splitStations ?? null, null);
  });
});
