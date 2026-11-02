import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bezecRateLimit,
  bezecRateLimitKey,
  clientIp,
  createRateLimiter,
  DEFAULT_BEZEC_RATE_LIMIT,
  DEFAULT_LIVE_RESULTS_RATE_LIMIT,
  liveResultsRateLimit,
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
  const ip = headers({ "x-forwarded-for": "203.0.113.7" });
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
    "10.0.0.1",
  );
  assert.equal(bezecRateLimitKey({ pathname: "/cs/kluby", method: "GET", headers: ip }), null);
  assert.equal(bezecRateLimitKey({ pathname: "/cs/bezecky", method: "GET", headers: ip }), null);
  assert.equal(bezecRateLimitKey({ pathname: "/cs/bezec/1", method: "POST", headers: ip }), null);
  assert.equal(
    bezecRateLimitKey({
      pathname: "/cs/bezec/19750001",
      method: "GET",
      headers: headers({ "x-forwarded-for": "203.0.113.7", "next-router-prefetch": "1" }),
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
      headers: headers({ "x-forwarded-for": "203.0.113.7", "sec-fetch-dest": "empty" }),
    }),
    null,
  );
  assert.equal(
    bezecRateLimitKey({
      pathname: "/cs/bezec/19750001",
      method: "GET",
      headers: headers({ "x-forwarded-for": "203.0.113.7", "sec-fetch-dest": "document" }),
    }),
    "203.0.113.7",
  );
});

test("client IP is the hop appended by the ingress, not what the client claims", () => {
  // ACA ingress appends the address it saw: only the rightmost hop is trustworthy.
  assert.equal(clientIp(headers({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" })), "203.0.113.7");
  assert.equal(clientIp(headers({ "x-forwarded-for": " 203.0.113.7 " })), "203.0.113.7");
  assert.equal(clientIp(headers({ "x-forwarded-for": "203.0.113.7, " })), "203.0.113.7");
  // Cloudflare does not proxy (DNS only), so a client-sent cf-connecting-ip is ignored ...
  const spoofed = headers({ "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "203.0.113.7" });
  assert.equal(clientIp(spoofed, { trustCloudflare: false }), "203.0.113.7");
  // ... unless explicitly trusted (TRUST_CF_CONNECTING_IP=true behind the Cloudflare proxy).
  assert.equal(clientIp(spoofed, { trustCloudflare: true }), "9.9.9.9");
  assert.equal(
    clientIp(headers({ "x-forwarded-for": "203.0.113.7" }), { trustCloudflare: true }),
    "203.0.113.7",
  );
  assert.equal(clientIp(headers({ "x-real-ip": "198.51.100.4" })), "198.51.100.4");
  // No header at all: no key, users are never lumped together.
  assert.equal(clientIp(headers({})), null);
  assert.equal(
    clientIp(headers({ "cf-connecting-ip": "9.9.9.9" }), { trustCloudflare: false }),
    null,
  );
});

test("spoofed X-Forwarded-For prefixes do not give a client fresh rate-limit keys", () => {
  const limiter = createRateLimiter({ limit: 2 });
  const t0 = 2_000_000;
  const results = [1, 2, 3].map((i) =>
    limiter.hit(clientIp(headers({ "x-forwarded-for": `10.0.0.${i}, 203.0.113.7` }))!, t0 + i),
  );
  assert.deepEqual(
    results.map((r) => r.limited),
    [false, false, true],
  );
});

test("online results limit: generous default for CGNAT, configurable, 0 = off", () => {
  assert.equal(DEFAULT_LIVE_RESULTS_RATE_LIMIT, 12_000);
  // A visible tab polls every 5 s: the default fits ~1000 tabs behind one address.
  assert.equal(DEFAULT_LIVE_RESULTS_RATE_LIMIT / 12, 1000);
  assert.equal(liveResultsRateLimit(undefined), DEFAULT_LIVE_RESULTS_RATE_LIMIT);
  assert.equal(liveResultsRateLimit(""), DEFAULT_LIVE_RESULTS_RATE_LIMIT);
  assert.equal(liveResultsRateLimit("0"), 0);
  assert.equal(liveResultsRateLimit("30000"), 30_000);
  assert.equal(liveResultsRateLimit("-5"), DEFAULT_LIVE_RESULTS_RATE_LIMIT);
  assert.equal(liveResultsRateLimit("lots"), DEFAULT_LIVE_RESULTS_RATE_LIMIT);
});

test("reset forgets one key's window", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
  assert.equal(limiter.hit("a", 1).limited, false);
  assert.equal(limiter.hit("a", 2).limited, true);
  assert.equal(limiter.hit("b", 2).limited, false);
  limiter.reset("a");
  assert.equal(limiter.hit("a", 3).limited, false);
  assert.equal(limiter.hit("b", 3).limited, true);
});
