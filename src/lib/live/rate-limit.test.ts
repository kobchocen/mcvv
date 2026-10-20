import assert from "node:assert/strict";
import { test } from "node:test";

import { RateLimiter } from "./rate-limit";

test("bucket empties and refills", () => {
  const limiter = new RateLimiter(2, 1);
  assert.ok(limiter.take("a", 0));
  assert.ok(limiter.take("a", 0));
  assert.ok(!limiter.take("a", 0));
  assert.ok(limiter.take("b", 0));
  assert.ok(limiter.take("a", 1000));
  assert.ok(!limiter.take("a", 1000));
});
