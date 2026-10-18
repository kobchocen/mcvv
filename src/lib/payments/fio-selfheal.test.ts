import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchFio, FIO_MIN_INTERVAL_MS, healStrongAuth, setFioLastDate } from "./fio";

const token = "SECRET-token_123";
const now = new Date("2026-10-18T10:00:00Z");
const STRONG = "Data není možné poskytnout bez silné autorizace";
const emptyStatement = { accountStatement: { info: { idTo: 5 }, transactionList: null } };

type Call = { url: string };
function mock(responses: Array<() => Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string) => {
    calls.push({ url: String(url) });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next();
  }) as unknown as typeof fetch;
  return { impl, calls };
}
function sleeper() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

test("fetchFio classifies 422 on /last/ as strong_auth and redacts token", async () => {
  const { impl } = mock([() => new Response(`${STRONG} ${token}`, { status: 422 })]);
  const r = await fetchFio(token, { mode: "last" }, impl);
  assert.equal(!r.ok && r.kind, "strong_auth");
  assert.ok(!r.ok && !r.error.includes(token));
});

test("setFioLastDate calls set-last-date and redacts failures", async () => {
  const ok = mock([() => new Response("", { status: 200 })]);
  assert.deepEqual(await setFioLastDate(token, "2026-10-11", ok.impl), { ok: true });
  assert.match(ok.calls[0].url, /\/set-last-date\/.+\/2026-10-11\/$/);
  const bad = mock([() => new Response(`bad ${token}`, { status: 500 })]);
  const r = await setFioLastDate(token, "2026-10-11", bad.impl);
  assert.ok(!r.ok && !r.error.includes(token));
  const boom = (async () => {
    throw new Error(`ECONNRESET ${token}`);
  }) as unknown as typeof fetch;
  const n = await setFioLastDate(token, "2026-10-11", boom);
  assert.ok(!n.ok && !n.error.includes(token));
});

test("healStrongAuth sets cursor and fetches periods in the same run, respecting rate limit", async () => {
  const { impl, calls } = mock([
    () => new Response("", { status: 200 }),
    () => Response.json(emptyStatement),
  ]);
  const { waits, sleep } = sleeper();
  const requests: Date[] = [];
  const heal = await healStrongAuth({
    token,
    now,
    fetchImpl: impl,
    sleep,
    onRequest: (at) => void requests.push(at),
  });
  assert.equal(heal.status, "healed");
  assert.ok(heal.status === "healed" && heal.result.ok);
  assert.deepEqual(heal.status === "healed" && heal.request, {
    mode: "periods",
    from: "2026-10-11",
    to: "2026-10-18",
  });
  assert.match(calls[0].url, /set-last-date\/.+\/2026-10-11\/$/);
  assert.match(calls[1].url, /periods\/.+\/2026-10-11\/2026-10-18\/transactions\.json$/);
  assert.deepEqual(waits, [FIO_MIN_INTERVAL_MS, FIO_MIN_INTERVAL_MS]);
  assert.equal(requests.length, 2);
});

test("healStrongAuth honours catchUpDays", async () => {
  const { impl, calls } = mock([
    () => new Response("", { status: 200 }),
    () => Response.json(emptyStatement),
  ]);
  await healStrongAuth({ token, now, catchUpDays: 3, fetchImpl: impl, sleep: sleeper().sleep });
  assert.match(calls[0].url, /\/2026-10-15\/$/);
});

test("healStrongAuth only sets cursor when budget forbids a same-run retry", async () => {
  const { impl, calls } = mock([() => new Response("", { status: 200 })]);
  const { waits, sleep } = sleeper();
  const heal = await healStrongAuth({
    token,
    now,
    fetchImpl: impl,
    sleep,
    waitBudgetMs: FIO_MIN_INTERVAL_MS,
  });
  assert.deepEqual(heal, { status: "cursor_set", date: "2026-10-11" });
  assert.equal(calls.length, 1);
  assert.deepEqual(waits, [FIO_MIN_INTERVAL_MS]);
});

test("healStrongAuth reports failure when set-last-date fails (no token in error)", async () => {
  const { impl, calls } = mock([() => new Response(`err ${token}`, { status: 500 })]);
  const heal = await healStrongAuth({ token, now, fetchImpl: impl, sleep: sleeper().sleep });
  assert.equal(heal.status, "failed");
  assert.ok(heal.status === "failed" && !heal.error.includes(token));
  assert.equal(calls.length, 1);
});
