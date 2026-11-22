import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PrismaClient } from "@prisma/client";

import { withTestWriteGate } from "@/lib/db/client";
import { enqueueMail, sendMail } from "@/lib/mail/queue";
import { postProviderEmail } from "@/lib/mail/provider";
import { mailBlockedInTest } from "@/lib/mail/test-block";

import { currentTestContext, runInTestContext, TestWriteBlockedError } from "./context";
import { lookupVerdict, testWriteVerdict, yearsIn } from "./gate-core";

const ctx = { year: 9026, readOnly: false };
const ok = { ok: true };

describe("test write gate (pure)", () => {
  it("reads always pass", () => {
    assert.deepEqual(testWriteVerdict(ctx, "Registration", "findMany", {}), ok);
    assert.deepEqual(testWriteVerdict(ctx, undefined, "$queryRaw", {}), ok);
  });

  it("protected tables are never writable in the test context", () => {
    for (const model of [
      "Registration",
      "RegistrationLine",
      "Payment",
      "Runner",
      "Club",
      "StartEntry",
      "Result",
      "Sale",
      "MailQueue",
      "Setting",
      "StartLineMeta",
      "User",
    ]) {
      for (const op of ["create", "update", "upsert", "delete", "deleteMany", "createMany"]) {
        const v = testWriteVerdict(ctx, model, op, { data: { year: 9026 }, where: { year: 9026 } });
        assert.equal(v.ok, false, `${model}.${op}`);
      }
    }
  });

  it("live tables accept only the shadow year – never the real one", () => {
    assert.deepEqual(
      testWriteVerdict(ctx, "Split", "create", { data: { year: 9026, bib: 1, split: "1" } }),
      ok,
    );
    assert.equal(
      testWriteVerdict(ctx, "Split", "create", { data: { year: 2026, bib: 1, split: "1" } }).ok,
      false,
    );
    assert.equal(
      testWriteVerdict(ctx, "StartCheck", "createMany", {
        data: [{ year: 9026 }, { year: 2026 }],
      }).ok,
      false,
    );
    assert.deepEqual(
      testWriteVerdict(ctx, "StartCheck", "upsert", {
        where: { year_bib: { year: 9026, bib: 5 } },
        create: { year: 9026, bib: 5 },
        update: { source: "x" },
      }),
      ok,
    );
    assert.equal(
      testWriteVerdict(ctx, "StartCheck", "upsert", {
        where: { year_bib: { year: 9026, bib: 5 } },
        create: { year: 2026, bib: 5 },
        update: {},
      }).ok,
      false,
    );
    assert.equal(
      testWriteVerdict(ctx, "Split", "deleteMany", { where: { year: { in: [9026, 2026] } } }).ok,
      false,
    );
    assert.equal(testWriteVerdict(ctx, "Split", "deleteMany", { where: {} }).ok, false);
    assert.equal(
      testWriteVerdict(ctx, "SplitEntry", "updateMany", {
        where: { year: 9026 },
        data: { year: 2026 },
      }).ok,
      false,
    );
    assert.equal(
      testWriteVerdict(ctx, "Split", "updateMany", { where: { year: { gte: 9000 } } }).ok,
      false,
    );
  });

  it("single-record update by id needs a lookup of its year", () => {
    const v = testWriteVerdict(ctx, "FinishBib", "update", { where: { id: 3 }, data: {} });
    assert.equal(v.ok, "lookup");
    assert.deepEqual(lookupVerdict(ctx, { year: 9026 }), ok);
    assert.equal(lookupVerdict(ctx, { year: 2026 }).ok, false);
  });

  it("test tables and audit are writable, everything locked after the end", () => {
    assert.deepEqual(testWriteVerdict(ctx, "TestModeOnsite", "create", { data: {} }), ok);
    assert.deepEqual(testWriteVerdict(ctx, "AuditLog", "create", { data: {} }), ok);
    const done = { year: 9026, readOnly: true };
    assert.equal(testWriteVerdict(done, "Split", "create", { data: { year: 9026 } }).ok, false);
    assert.equal(testWriteVerdict(done, "TestModeOnsite", "create", { data: {} }).ok, false);
  });

  it("raw writes are blocked, a non-shadow context year blocks live tables", () => {
    assert.equal(testWriteVerdict(ctx, undefined, "$executeRaw", {}).ok, false);
    assert.equal(testWriteVerdict(ctx, undefined, "$executeRawUnsafe", {}).ok, false);
    const wrong = { year: 2026, readOnly: false };
    assert.equal(testWriteVerdict(wrong, "Split", "create", { data: { year: 2026 } }).ok, false);
  });

  it("yearsIn reads plain, equals, in and composite keys", () => {
    assert.deepEqual(yearsIn({ year: 9026 }), [9026]);
    assert.deepEqual(yearsIn({ year: { equals: 9026 } }), [9026]);
    assert.deepEqual(yearsIn({ year_bib: { year: 9026, bib: 1 } }), [9026]);
    assert.equal(yearsIn({ year: { gte: 1 } }), null);
    assert.deepEqual(yearsIn({ bib: 1 }), []);
  });
});

/** Falešný Prisma klient: zachytí definici rozšíření, ať jde bránu volat bez databáze. */
function fakeGated(lookupYear: number | null = null) {
  let hook: ((p: unknown) => Promise<unknown>) | null = null;
  const base = {
    $extends(def: { query: { $allOperations: (p: unknown) => Promise<unknown> } }) {
      hook = def.query.$allOperations;
      return base;
    },
    finishBib: { findUnique: async () => (lookupYear == null ? null : { year: lookupYear }) },
  };
  withTestWriteGate(base as unknown as PrismaClient);
  const writes: string[] = [];
  const call = (model: string | undefined, operation: string, args: unknown) =>
    hook!({
      model,
      operation,
      args,
      query: async () => {
        writes.push(`${model}.${operation}`);
        return "done";
      },
    });
  return { call, writes };
}

describe("test write gate (Prisma extension)", () => {
  const test = { runId: 1, year: 9026, readOnly: false };

  it("outside the test context nothing changes", async () => {
    const { call, writes } = fakeGated();
    assert.equal(currentTestContext(), null);
    await call("Registration", "create", { data: { year: 2026 } });
    assert.deepEqual(writes, ["Registration.create"]);
  });

  it("in the test context a write to the live year never reaches the database", async () => {
    const { call, writes } = fakeGated();
    await runInTestContext(test, async () => {
      await assert.rejects(
        call("Split", "create", { data: { year: 2026, bib: 1, split: "1", time: 1 } }),
        TestWriteBlockedError,
      );
      await assert.rejects(
        call("Registration", "update", { where: { year_id: { year: 9026, id: 1 } }, data: {} }),
        TestWriteBlockedError,
      );
      await assert.rejects(call("MailQueue", "create", { data: {} }), TestWriteBlockedError);
      await call("Split", "create", { data: { year: 9026, bib: 1, split: "1", time: 1 } });
    });
    assert.deepEqual(writes, ["Split.create"]);
  });

  it("update by id passes only for a shadow-year record", async () => {
    const live = fakeGated(2026);
    await runInTestContext(test, async () => {
      await assert.rejects(
        live.call("FinishBib", "update", { where: { id: 7 }, data: { deleted: true } }),
        TestWriteBlockedError,
      );
    });
    assert.deepEqual(live.writes, []);
    const shadow = fakeGated(9026);
    await runInTestContext(test, () =>
      shadow.call("FinishBib", "update", { where: { id: 7 }, data: { deleted: true } }),
    );
    assert.deepEqual(shadow.writes, ["FinishBib.update"]);
  });
});

describe("mail block in the test context", () => {
  const test = { runId: 1, year: 9026, readOnly: false };

  it("no mail is queued or sent from a test", async () => {
    assert.equal(mailBlockedInTest("other"), false);
    await runInTestContext(test, async () => {
      assert.equal(mailBlockedInTest("other"), true);
      // Bez databáze: kdyby fronta zapisovala, test by spadl na připojení.
      assert.deepEqual(
        await enqueueMail({ to: "a@b.cz", subject: "s", html: "h", text: "t", kind: "other" }),
        { id: 0, created: false },
      );
      assert.equal(
        await sendMail({ to: "a@b.cz", subject: "s", html: "h", text: "t", kind: "other" }),
        "queued",
      );
      let fetched = false;
      const result = await postProviderEmail(
        { to: "a@b.cz", subject: "s", html: "h", text: "t" },
        {
          dryRun: false,
          fetchImpl: (async () => {
            fetched = true;
            return new Response("{}");
          }) as typeof fetch,
        },
      );
      assert.deepEqual(result, { ok: true, providerId: null });
      assert.equal(fetched, false);
    });
  });
});
