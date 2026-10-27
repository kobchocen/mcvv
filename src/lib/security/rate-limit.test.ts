import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bezecRateLimit,
  bezecRateLimitKey,
  createRateLimiter,
  DEFAULT_BEZEC_RATE_LIMIT,
} from "./rate-limit";

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

test("limiter allows `limit` hits per window and then answers with Retry-After", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i += 1)
    assert.deepEqual(limiter.hit("1.2.3.4", t0 + i), { limited: false });
  assert.deepEqual(limiter.hit("1.2.3.4", t0 + 10_000), { limited: true, retryAfterSeconds: 50 });
  // Other IPs are independent, a new window starts over.
  assert.deepEqual(limiter.hit("5.6.7.8", t0 + 10_000), { limited: false });
  assert.deepEqual(limiter.hit("1.2.3.4", t0 + 60_000), { limited: false });
});

test("limit 0 is off; memory stays bounded", () => {
  const off = createRateLimiter({ limit: 0 });
  for (let i = 0; i < 1000; i += 1) assert.equal(off.hit("ip").limited, false);
  const small = createRateLimiter({ limit: 1, maxKeys: 10 });
  for (let i = 0; i < 100; i += 1) assert.equal(small.hit(`ip-${i}`, 5).limited, false);
});

test("BEZEC_RATE_LIMIT parsing", () => {
  assert.equal(bezecRateLimit(undefined), DEFAULT_BEZEC_RATE_LIMIT);
  assert.equal(bezecRateLimit(""), DEFAULT_BEZEC_RATE_LIMIT);
  assert.equal(bezecRateLimit("0"), 0);
  assert.equal(bezecRateLimit("300"), 300);
  assert.equal(bezecRateLimit("abc"), DEFAULT_BEZEC_RATE_LIMIT);
});

test("only runner profile page views with a client IP are counted", () => {
  const ip = headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "10.0.0.1" });
  assert.equal(
    bezecRateLimitKey({ pathname: "/cs/bezec/19750001", method: "GET", headers: ip }),
    "203.0.113.7",
  );
  assert.equal(
    bezecRateLimitKey({ pathname: "/en/bezec/19750001", method: "HEAD", headers: ip }),
    "203.0.113.7",
  );
  assert.equal(
    bezecRateLimitKey({
      pathname: "/cs/bezec/19750001",
      method: "GET",
      headers: headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }),
    }),
    "198.51.100.2",
  );
  assert.equal(bezecRateLimitKey({ pathname: "/cs/kluby", method: "GET", headers: ip }), null);
  assert.equal(bezecRateLimitKey({ pathname: "/cs/bezecky", method: "GET", headers: ip }), null);
  assert.equal(bezecRateLimitKey({ pathname: "/cs/bezec/1", method: "POST", headers: ip }), null);
  assert.equal(
    bezecRateLimitKey({
      pathname: "/cs/bezec/19750001",
      method: "GET",
      headers: headers({ "cf-connecting-ip": "203.0.113.7", "next-router-prefetch": "1" }),
    }),
    null,
  );
  assert.equal(
    bezecRateLimitKey({ pathname: "/cs/bezec/19750001", method: "GET", headers: headers({}) }),
    null,
  );
  // Browser fetch() (Next.js prefetch / client navigation) does not count, documents do.
  assert.equal(
    bezecRateLimitKey({
      pathname: "/cs/bezec/19750001",
      method: "GET",
      headers: headers({ "cf-connecting-ip": "203.0.113.7", "sec-fetch-dest": "empty" }),
    }),
    null,
  );
  assert.equal(
    bezecRateLimitKey({
      pathname: "/cs/bezec/19750001",
      method: "GET",
      headers: headers({ "cf-connecting-ip": "203.0.113.7", "sec-fetch-dest": "document" }),
    }),
    "203.0.113.7",
  );
});
