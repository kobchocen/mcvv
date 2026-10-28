import assert from "node:assert/strict";
import { test } from "node:test";

import { createBodyCache, etagFor, etagMatches } from "./speaker-cache";

test("body cache loads at most once per TTL and shares in-flight loads", async () => {
  let t = 0;
  let loads = 0;
  const cache = createBodyCache(
    async () => {
      loads += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { n: 1 };
    },
    3000,
    () => t,
  );
  const [a, b, c] = await Promise.all([cache.get(), cache.get(), cache.get()]);
  assert.equal(loads, 1);
  assert.equal(a, b);
  assert.equal(b, c);
  t = 2999;
  await cache.get();
  assert.equal(loads, 1);
  t = 3000;
  const d = await cache.get();
  assert.equal(loads, 2);
  assert.equal(d.etag, a.etag, "same data → same ETag");
});

test("failed load is not cached", async () => {
  let fail = true;
  const cache = createBodyCache(async () => {
    if (fail) throw new Error("db down");
    return [1];
  }, 3000);
  await assert.rejects(cache.get());
  fail = false;
  assert.equal((await cache.get()).body, "[1]");
});

test("etag matching", () => {
  const etag = etagFor("{}");
  assert.match(etag, /^W\/"[\w-]{22}"$/);
  assert.equal(etagMatches(etag, etag), true);
  assert.equal(etagMatches(`"x", ${etag}`, etag), true);
  assert.equal(etagMatches(etag.slice(2), etag), true);
  assert.equal(etagMatches("*", etag), true);
  assert.equal(etagMatches(null, etag), false);
  assert.equal(etagMatches(etagFor("[]"), etag), false);
});
