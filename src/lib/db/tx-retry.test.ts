import assert from "node:assert/strict";
import { test } from "node:test";

import { Prisma } from "@prisma/client";

import { isRetryableTxError, withTxRetry } from "./tx-retry";

const known = (code: string, message = "x") =>
  new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: "test" });

test("retryable: P2002, P2034, MariaDB 1020 and deadlock; nothing else", () => {
  assert.equal(isRetryableTxError(known("P2002")), true);
  assert.equal(isRetryableTxError(known("P2034")), true);
  assert.equal(
    isRetryableTxError(
      known(
        "P2010",
        "Record has changed since last read in table 'x'. Please try restarting transaction",
      ),
    ),
    true,
  );
  assert.equal(isRetryableTxError(known("P2010", "Deadlock found when trying to get lock")), true);
  assert.equal(isRetryableTxError(known("P2025")), false);
  assert.equal(isRetryableTxError(new Error("restarting transaction")), false);
});

test("withTxRetry repeats a conflicting transaction and returns its result", async () => {
  let calls = 0;
  const pauses: number[] = [];
  const value = await withTxRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw known("P2034");
      return "ok";
    },
    { sleep: async (ms) => void pauses.push(ms), random: () => 0 },
  );
  assert.equal(value, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(pauses, [10, 10]);
});

test("withTxRetry gives up after the attempt limit and rethrows other errors at once", async () => {
  let calls = 0;
  await assert.rejects(
    withTxRetry(
      async () => {
        calls += 1;
        throw known("P2034");
      },
      { attempts: 3, sleep: async () => {} },
    ),
    (error: unknown) => isRetryableTxError(error),
  );
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(
    withTxRetry(
      async () => {
        calls += 1;
        throw new Error("boom");
      },
      { sleep: async () => {} },
    ),
    /boom/,
  );
  assert.equal(calls, 1);
});
