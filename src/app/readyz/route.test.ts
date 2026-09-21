import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";

test("readiness reflects database failures without exposing connection details", async (context) => {
  let query = () => Promise.resolve([{ value: 1 }]);
  global.prisma = { $queryRaw: () => query() } as unknown as PrismaClient;
  const { GET } = await import("./route");

  await context.test("connected database is ready", async () => {
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { status: "ready" });
  });

  await context.test("database error returns a generic 503", async () => {
    query = () => Promise.reject(new Error("private connection details"));
    const response = await GET();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "not_ready" });
  });

  await context.test("a stalled query times out", async (timerContext) => {
    timerContext.mock.timers.enable({ apis: ["setTimeout"] });
    query = () => new Promise(() => {});
    const responsePromise = GET();
    timerContext.mock.timers.tick(2_000);
    assert.equal((await responsePromise).status, 503);
  });
});
