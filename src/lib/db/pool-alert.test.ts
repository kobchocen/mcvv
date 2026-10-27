import assert from "node:assert/strict";
import { test } from "node:test";

import { isPoolExhaustedError, poolExhaustedLogLine } from "./pool-alert";

const poolError = Object.assign(
  new Error(
    "Invalid `prisma.result.findMany()` invocation:\nDatabase error. Code: `45028`. Message: " +
      "`pool failed to retrieve a connection from pool\n    (pool connections: active=5 idle=0 limit=5)`",
  ),
  { code: "P2039" },
);

test("P2039 and the adapter pool message are recognised", () => {
  assert.equal(isPoolExhaustedError(poolError), true);
  assert.equal(isPoolExhaustedError({ code: "P2039" }), true);
  assert.equal(
    isPoolExhaustedError(new Error("pool timeout: failed to retrieve a connection")),
    true,
  );
});

test("other errors are not pool errors", () => {
  assert.equal(isPoolExhaustedError(new Error("Unique constraint failed")), false);
  assert.equal(isPoolExhaustedError({ code: "P2002" }), false);
  assert.equal(isPoolExhaustedError(null), false);
  assert.equal(isPoolExhaustedError("P2039"), false);
});

test("log line has route and pool state, no query string", () => {
  const line = poolExhaustedLogLine(
    poolError,
    { path: "/cs/bezec/19750001?token=secret", method: "GET" },
    { routePath: "/[locale]/bezec/[id]", routeType: "render" },
  );
  assert.match(line, /^\[db\] pool exhausted \(P2039\) /);
  assert.match(line, /"path":"\/cs\/bezec\/19750001"/);
  assert.match(line, /"route":"\/\[locale\]\/bezec\/\[id\]"/);
  assert.match(line, /"pool":"active=5 idle=0 limit=5"/);
  assert.doesNotMatch(line, /secret/);
});
