import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Prisma, type PrismaClient } from "@prisma/client";

import {
  applySexChange,
  previewSexChange,
  RUNNER_HISTORY_MODELS,
  RUNNER_REFERENCE_MODELS,
  RUNNER_REKEYED_MODELS,
  SexChangeError,
} from "./runner-rekey";
import {
  allocateRunnerId,
  planLine,
  sexDigits,
  type CategoryRow,
  groupTransitions,
  yearSpan,
} from "./runner-sex-core";

// Real categories (cis_mcvv_kateg, DEV).
const CATEGORIES: CategoryRow[] = [
  { id: "J", name: "žáci", age: 14, sex: "M", entryFee: 50 },
  { id: "L", name: "dorostenci", age: 18, sex: "M", entryFee: 50 },
  { id: "A", name: "muži", age: 0, sex: "M", entryFee: 100 },
  { id: "B", name: "muži nad 40 let", age: 40, sex: "M", entryFee: 100 },
  { id: "C", name: "muži nad 50 let", age: 50, sex: "M", entryFee: 100 },
  { id: "K", name: "žákyně", age: 14, sex: "F", entryFee: 50 },
  { id: "M", name: "dorostenky", age: 18, sex: "F", entryFee: 50 },
  { id: "F", name: "ženy", age: 0, sex: "F", entryFee: 100 },
  { id: "G", name: "ženy nad 40 let", age: 40, sex: "F", entryFee: 100 },
  { id: "H", name: "ženy nad 50 let", age: 50, sex: "F", entryFee: 100 },
];

describe("allocateRunnerId", () => {
  it("follows the new-runner scheme: YYYY + 0/5 + next sequence", () => {
    assert.equal(allocateRunnerId(["19830001", "19835001", "19835002"], 1983, "F"), "19835003");
    assert.equal(allocateRunnerId(["19835001"], 1983, "M"), "19830001");
    assert.equal(allocateRunnerId([], 2007, "F"), "20075001");
  });

  it("skips ids that are taken (e.g. orphan references) and never collides", () => {
    assert.equal(allocateRunnerId(["19835001", "19835002"], 1983, "F"), "19835003");
    const taken = new Set(["19830001", "19830002"]);
    const id = allocateRunnerId(taken, 1983, "M");
    assert.ok(!taken.has(id));
  });

  it("moves to the next digit of the same sex range when a prefix is full", () => {
    const full = Array.from({ length: 999 }, (_, i) => `19835${String(i + 1).padStart(3, "0")}`);
    assert.equal(allocateRunnerId(full, 1983, "F"), "19836001");
    assert.deepEqual(sexDigits("M"), ["0", "1", "2", "3", "4"]);
  });

  it("rejects invalid birth years", () => {
    assert.throws(() => allocateRunnerId([], Number.NaN, "M"));
    assert.throws(() => allocateRunnerId([], 99, "M"));
  });
});

describe("planLine", () => {
  it("recalculates category and fee of the current year's line", () => {
    const plan = planLine(
      { year: 2026, registrationId: 4, categoryId: "J", entryFee: 50 },
      "F",
      2013,
      CATEGORIES,
      2026,
    );
    assert.deepEqual(plan.newCategory, { id: "K", name: "žákyně" });
    assert.equal(plan.newFee, 50);
    assert.equal(plan.feeChanged, false);
  });

  it("shows a fee change when the new category costs differently", () => {
    // born 2008: dorostenci (M, 50 Kč) → in 2026 is 18 → dorostenky (F, 50 Kč); born 2007 (19) → ženy 100 Kč
    const plan = planLine(
      { year: 2026, registrationId: 4, categoryId: "A", entryFee: 100 },
      "F",
      2007,
      CATEGORIES,
      2026,
    );
    assert.deepEqual(plan.newCategory, { id: "F", name: "ženy" });
    assert.equal(plan.feeChanged, false);
    const kid = planLine(
      { year: 2026, registrationId: 4, categoryId: "A", entryFee: 100 },
      "F",
      2010,
      CATEGORIES,
      2026,
    );
    assert.deepEqual(kid.newCategory, { id: "M", name: "dorostenky" });
    assert.equal(kid.newFee, 50);
    assert.equal(kid.feeChanged, true);
  });

  it("keeps a free entry free and does not touch fees of past years", () => {
    const free = planLine(
      { year: 2026, registrationId: 1, categoryId: "B", entryFee: 0 },
      "F",
      1980,
      CATEGORIES,
      2026,
    );
    assert.equal(free.newFee, 0);
    assert.deepEqual(free.newCategory, { id: "G", name: "ženy nad 40 let" });
    const past = planLine(
      { year: 2024, registrationId: 9, categoryId: "A", entryFee: 100 },
      "F",
      2010,
      CATEGORIES,
      2026,
    );
    assert.equal(past.newFee, 100);
    assert.equal(past.feeChanged, false);
    assert.deepEqual(past.newCategory, { id: "K", name: "žákyně" });
  });
});

// ---------------------------------------------------------------------------
// In-memory Prisma double for the re-keying transaction.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown> & { runnerId?: string | null };
type Where = Record<string, unknown>;

function matches(row: Row, where: Where = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "year_runnerId") {
      const c = cond as { year: number; runnerId: string };
      return row.year === c.year && row.runnerId === c.runnerId;
    }
    if (cond && typeof cond === "object" && "startsWith" in cond) {
      return (
        typeof row[key] === "string" && (row[key] as string).startsWith(String(cond.startsWith))
      );
    }
    return row[key] === cond;
  });
}

function pick(row: Row, select?: Record<string, boolean>): Row {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
}

function table(rows: Row[], pk: (row: Row) => string) {
  const assertUnique = () => {
    const keys = rows.map(pk);
    assert.equal(new Set(keys).size, keys.length, `duplicate primary key in ${keys.join(",")}`);
  };
  return {
    rows,
    findUnique: async ({ where, select }: { where: Where; select?: Record<string, boolean> }) => {
      const row = rows.find((r) => matches(r, where));
      return row ? pick(row, select) : null;
    },
    findMany: async (
      args: { where?: Where; select?: Record<string, boolean>; distinct?: string[] } = {},
    ) => {
      const found = rows.filter((r) => matches(r, args.where)).map((r) => pick(r, args.select));
      if (!args.distinct) return found;
      const seen = new Set<string>();
      return found.filter((r) => {
        const key = args.distinct!.map((k) => String(r[k])).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    count: async ({ where }: { where: Where }) => rows.filter((r) => matches(r, where)).length,
    create: async ({ data }: { data: Row }) => {
      rows.push({ ...data });
      assertUnique();
      return data;
    },
    delete: async ({ where }: { where: Where }) => {
      const index = rows.findIndex((r) => matches(r, where));
      assert.ok(index >= 0, "delete: row not found");
      return rows.splice(index, 1)[0];
    },
    update: async ({ where, data }: { where: Where; data: Row }) => {
      const row = rows.find((r) => matches(r, where));
      assert.ok(row, `update: row not found ${JSON.stringify(where)}`);
      Object.assign(row, data);
      assertUnique();
      return row;
    },
    updateMany: async ({ where, data }: { where: Where; data: Row }) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const row of hit) Object.assign(row, data);
      assertUnique();
      return { count: hit.length };
    },
  };
}

function fakeDb() {
  const db = {
    runner: table(
      [
        { id: "19830002", name: "Nováková Jana", created: null, author: "web" },
        { id: "19830001", name: "Jiný Muž", created: null, author: "web" },
        { id: "19835001", name: "Jiná Žena", created: null, author: "web" },
      ],
      (r) => String(r.id),
    ),
    registrationLine: table(
      [
        {
          year: 2026,
          runnerId: "19830002",
          registrationId: 4,
          categoryId: "B",
          entryFee: 100,
          clubId: "001",
        },
        {
          year: 2025,
          runnerId: "19830002",
          registrationId: 17,
          categoryId: "B",
          entryFee: 100,
          clubId: "001",
        },
        {
          year: 2026,
          runnerId: "19830001",
          registrationId: 4,
          categoryId: "B",
          entryFee: 100,
          clubId: "001",
        },
      ],
      (r) => `${r.year}|${r.runnerId}`,
    ),
    startEntry: table(
      [{ year: 2025, runnerId: "19830002", categoryId: "B", bib: 12, clubId: "001" }],
      (r) => `${r.year}|${r.runnerId}`,
    ),
    result: table(
      [
        // 19830001 has history → sex change not allowed; 19830002 is a newcomer.
        { year: 2024, runnerId: "19830001", categoryId: "B", time: 1500, clubId: "001" },
        { year: 2025, runnerId: "19830001", categoryId: "B", time: 1490, clubId: "001" },
        // orphan reference: id 19835002 is used in results but missing in cis_bezec
        { year: 2010, runnerId: "19835002", categoryId: "F", time: 1600, clubId: "001" },
      ],
      (r) => `${r.year}|${r.runnerId}`,
    ),
    runnerPhoto: table(
      [
        { photoId: 1, runnerId: "19830002" },
        { photoId: 2, runnerId: "19830002" },
        { photoId: 2, runnerId: "19830001" },
      ],
      (r) => `${r.photoId}|${r.runnerId}`,
    ),
    webImage: table([{ id: 7, runnerId: "19830002" }], (r) => String(r.id)),
    startLineMeta: table(
      [{ year: 2026, runnerId: "19830002", locked: true, groupId: null }],
      (r) => `${r.year}|${r.runnerId}`,
    ),
    category: table(CATEGORIES as unknown as Row[], (r) => String(r.id)),
  };
  let failAt: string | null = null;
  const client = {
    ...db,
    failOn(model: string) {
      failAt = model;
    },
    async $transaction<T>(callback: (tx: typeof db) => Promise<T>): Promise<T> {
      // Run against a deep copy and commit only on success (all-or-nothing).
      const snapshot = structuredClone(
        Object.fromEntries(Object.entries(db).map(([k, t]) => [k, t.rows])),
      );
      try {
        if (failAt) {
          const model = failAt as keyof typeof db;
          const original = db[model].updateMany;
          db[model].updateMany = async () => {
            throw new Error("boom");
          };
          try {
            return await callback(db);
          } finally {
            db[model].updateMany = original;
          }
        }
        return await callback(db);
      } catch (error) {
        for (const [key, rows] of Object.entries(snapshot)) {
          const target = db[key as keyof typeof db].rows;
          target.splice(0, target.length, ...(rows as Row[]));
        }
        throw error;
      }
    },
  };
  return client;
}

const asClient = (fake: ReturnType<typeof fakeDb>) => fake as unknown as PrismaClient;

describe("applySexChange (re-keying in one transaction)", () => {
  it("previews old → new id, categories and counts without writing", async () => {
    const fake = fakeDb();
    const plan = await previewSexChange(asClient(fake), "19830002", 2026);
    assert.equal(plan.oldId, "19830002");
    // 19835001 exists, 19835002 is an orphan in results → next free is 19835003
    assert.equal(plan.newId, "19835003");
    assert.equal(plan.newSex, "F");
    assert.deepEqual(
      plan.lines.map((l) => [l.year, l.oldCategory.id, l.newCategory?.id]),
      [
        [2026, "B", "G"],
        [2025, "B", "G"],
      ],
    );
    assert.equal(plan.photos, 2);
    assert.equal(fake.runner.rows.length, 3, "nothing written");
  });

  it("newcomer: re-points every reference, recalculates categories and drops the old id", async () => {
    const fake = fakeDb();
    const resultsBefore = JSON.stringify(fake.result.rows);
    const outcome = await applySexChange(asClient(fake), {
      runnerId: "19830002",
      currentYear: 2026,
    });
    assert.equal(outcome.newId, "19835003");
    assert.deepEqual(outcome.counts, {
      registrationLines: 2,
      startEntries: 1,
      runnerPhotos: 2,
      webImages: 1,
      startLines: 1,
    });
    const ids = fake.runner.rows.map((r) => r.id);
    assert.ok(ids.includes("19835003"));
    assert.ok(!ids.includes("19830002"));
    assert.equal(fake.runner.rows.find((r) => r.id === "19835003")?.name, "Nováková Jana");
    for (const model of [
      "registrationLine",
      "startEntry",
      "runnerPhoto",
      "webImage",
      "startLineMeta",
    ] as const) {
      assert.ok(
        !fake[model].rows.some((r) => r.runnerId === "19830002"),
        `${model} still references the old id`,
      );
    }
    // Both registrations (2026/4 and 2025/17) moved and got the women's category.
    const lines = fake.registrationLine.rows.filter((r) => r.runnerId === "19835003");
    assert.deepEqual(lines.map((r) => [r.year, r.registrationId, r.categoryId]).sort(), [
      [2025, 17, "G"],
      [2026, 4, "G"],
    ]);
    assert.equal(fake.startEntry.rows[0].categoryId, "G");
    // mcvv_time is never written.
    assert.equal(JSON.stringify(fake.result.rows), resultsBefore);
    assert.equal(fake.result.rows.filter((r) => r.runnerId === "19835003").length, 0);
    // Other runners untouched (shared photo 2 still tagged with 19830001).
    assert.ok(fake.runnerPhoto.rows.some((r) => r.photoId === 2 && r.runnerId === "19830001"));
    assert.ok(fake.registrationLine.rows.some((r) => r.runnerId === "19830001"));
  });

  it("rejects a runner with historical results and changes nothing", async () => {
    const fake = fakeDb();
    const before = JSON.stringify(
      Object.fromEntries(Object.entries(fake).map(([k, t]) => [k, (t as { rows?: unknown }).rows])),
    );
    const isHasResults = (error: unknown) =>
      error instanceof SexChangeError && error.code === "has_results";
    await assert.rejects(
      applySexChange(asClient(fake), { runnerId: "19830001", currentYear: 2026 }),
      isHasResults,
    );
    await assert.rejects(previewSexChange(asClient(fake), "19830001", 2026), isHasResults);
    assert.equal(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(fake).map(([k, t]) => [k, (t as { rows?: unknown }).rows]),
        ),
      ),
      before,
    );
  });

  it("re-checks inside the transaction: a result written meanwhile rolls everything back", async () => {
    const fake = fakeDb();
    const before = JSON.stringify(fake.runner.rows) + JSON.stringify(fake.registrationLine.rows);
    // Simulate a concurrent import: a result for the old id appears after the re-key started.
    const original = fake.webImage.updateMany;
    fake.webImage.updateMany = async (args) => {
      fake.result.rows.push({
        year: 2026,
        runnerId: "19830002",
        categoryId: "B",
        time: 1,
        clubId: "001",
      });
      return original(args);
    };
    await assert.rejects(
      applySexChange(asClient(fake), { runnerId: "19830002", currentYear: 2026 }),
      (error: unknown) => error instanceof SexChangeError && error.code === "has_results",
    );
    assert.equal(
      JSON.stringify(fake.runner.rows) + JSON.stringify(fake.registrationLine.rows),
      before,
    );
  });

  it("works back from female to male", async () => {
    const fake = fakeDb();
    const outcome = await applySexChange(asClient(fake), {
      runnerId: "19835001",
      currentYear: 2026,
    });
    // 19830001 and 19830002 exist → 19830003
    assert.equal(outcome.newId, "19830003");
    assert.equal(outcome.newSex, "M");
  });

  it("rolls everything back when a step fails", async () => {
    const fake = fakeDb();
    const before = JSON.stringify(fake.result.rows) + JSON.stringify(fake.runner.rows);
    fake.failOn("runnerPhoto");
    await assert.rejects(
      applySexChange(asClient(fake), {
        runnerId: "19830002",
        currentYear: 2026,
      }),
      /boom/,
    );
    assert.equal(JSON.stringify(fake.result.rows) + JSON.stringify(fake.runner.rows), before);
  });

  it("reports unknown or malformed runner ids", async () => {
    const fake = fakeDb();
    await assert.rejects(
      applySexChange(asClient(fake), {
        runnerId: "19839999",
        currentYear: 2026,
      }),
      (error: unknown) => error instanceof SexChangeError && error.code === "not_found",
    );
    await assert.rejects(
      previewSexChange(asClient(fake), "1983'--", 2026),
      (error: unknown) => error instanceof SexChangeError && error.code === "invalid_id",
    );
  });
});

describe("schema coverage", () => {
  it("never re-keys results (history), only guards them", () => {
    assert.ok(!(RUNNER_REKEYED_MODELS as readonly string[]).includes("Result"));
    assert.deepEqual([...RUNNER_HISTORY_MODELS], ["Result"]);
  });

  it("re-keys or guards every model that references the runner (cis_bezec)", () => {
    const referencing = Prisma.dmmf.datamodel.models
      .filter(
        (model) =>
          model.name !== "Runner" &&
          model.fields.some((field) => field.kind === "object" && field.type === "Runner"),
      )
      .map((model) => model.name)
      .sort();
    assert.deepEqual(referencing, [...RUNNER_REFERENCE_MODELS].sort());
  });

  it("no other table stores a runner id column (bezec_id) without a relation", () => {
    const schema = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");
    const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
      .filter(([, , body]) => /@map\("bezec_id"\)/.test(body))
      .map(([, name]) => name)
      .sort();
    assert.deepEqual(models, [...RUNNER_REFERENCE_MODELS].sort());
  });
});

describe("groupTransitions", () => {
  const change = (year: number, from: string, to: string | null) => ({
    year,
    oldCategory: { id: from, name: from },
    newCategory: to ? { id: to, name: to } : null,
  });

  it("merges consecutive years with the same change, newest first", () => {
    const groups = groupTransitions([
      change(2014, "žáci", "žákyně"),
      change(2016, "dorostenci", "dorostenky"),
      change(2015, "žáci", "žákyně"),
      change(2017, "dorostenci", "dorostenky"),
      change(2020, "muži", "ženy"),
    ]);
    assert.deepEqual(
      groups.map((group) => [yearSpan(group), group.count, group.from, group.to]),
      [
        ["2020", 1, "muži", "ženy"],
        ["2016\u20132017", 2, "dorostenci", "dorostenky"],
        ["2014\u20132015", 2, "žáci", "žákyně"],
      ],
    );
  });

  it("does not bridge a gap in years or a missing target category", () => {
    const groups = groupTransitions([
      change(2010, "muži", "ženy"),
      change(2012, "muži", "ženy"),
      change(2011, "muži", null),
    ]);
    assert.equal(groups.length, 3);
  });
});
