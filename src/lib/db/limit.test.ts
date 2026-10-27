import assert from "node:assert/strict";
import { test } from "node:test";

import { createLimiter } from "./limit";

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

test("limiter runs at most max tasks at once and all of them finish", async () => {
  const limit = createLimiter(2);
  let active = 0;
  let peak = 0;
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      limit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await tick();
        active -= 1;
        return index;
      }),
    ),
  );
  assert.equal(peak, 2);
  assert.deepEqual(
    results,
    Array.from({ length: 10 }, (_, index) => index),
  );
});

test("a failing task releases its slot", async () => {
  const limit = createLimiter(1);
  await assert.rejects(
    limit(async () => {
      throw new Error("boom");
    }),
    /boom/,
  );
  assert.equal(await limit(async () => "next"), "next");
});

test("max must be a positive integer", () => {
  assert.throws(() => createLimiter(0));
});

test("a newcomer cannot take a slot that is being handed to a waiting task", async () => {
  const limit = createLimiter(1);
  let active = 0;
  let peak = 0;
  const task = async () => {
    active += 1;
    peak = Math.max(peak, active);
    await tick();
    active -= 1;
  };
  const first = limit(task);
  const second = limit(task);
  await first;
  await Promise.all([second, limit(task)]);
  assert.equal(peak, 1);
});
