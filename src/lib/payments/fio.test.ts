import assert from "node:assert/strict";
import { test } from "node:test";

import { chooseRequest, fetchFio, fioUrl, parseFioStatement, periodsWindow, redact } from "./fio";

const fixture = {
  accountStatement: {
    info: { accountId: "2700938285", idTo: 26000000003, idLastDownload: null },
    transactionList: {
      transaction: [
        {
          column22: { value: 26000000001 },
          column0: { value: "2026-10-13+0200" },
          column1: { value: 500 },
          column14: { value: "CZK" },
          column5: { value: "202632" },
          column2: { value: "2800137258" },
          column3: { value: "2010" },
          column10: { value: "Novák Jan" },
          column16: { value: "STARTOVNE MCVV PRIHLASKA 32" },
        },
        {
          column22: { value: 26000000002 },
          column0: { value: "2026-10-14+0200" },
          column1: { value: -120 },
          column14: { value: "CZK" },
          column5: null,
        },
      ],
    },
  },
};

test("parseFioStatement maps columns to transactions", () => {
  const { transactions, lastId } = parseFioStatement(fixture);
  assert.equal(transactions.length, 2);
  assert.equal(lastId, BigInt(26000000003));
  const [t] = transactions;
  assert.equal(t.fioId, BigInt(26000000001));
  assert.equal(t.date, "2026-10-13");
  assert.equal(t.amount, 500);
  assert.equal(t.vs, "202632");
  assert.equal(t.counterAccount, "2800137258/2010");
  assert.equal(t.counterName, "Novák Jan");
  assert.equal(transactions[1].vs, null);
});

test("parseFioStatement handles an empty transaction list", () => {
  const { transactions } = parseFioStatement({
    accountStatement: { info: {}, transactionList: null },
  });
  assert.equal(transactions.length, 0);
});

test("periods window never exceeds the 90-day Fio limit", () => {
  const now = new Date("2026-10-18T10:00:00Z");
  assert.deepEqual(periodsWindow(now, 7), { from: "2026-10-11", to: "2026-10-18" });
  assert.equal(periodsWindow(now, 365).from, "2026-07-21");
});

test("chooseRequest uses /last/ only after a healthy run and today's periods sweep", () => {
  const now = new Date("2026-10-18T10:00:00Z");
  assert.equal(
    chooseRequest({ mode: "periods", now, lastRunOk: true, lastPeriodsDay: "2026-10-18" }).mode,
    "periods",
  );
  assert.equal(
    chooseRequest({ mode: "last", now, lastRunOk: true, lastPeriodsDay: "2026-10-18" }).mode,
    "last",
  );
  assert.equal(
    chooseRequest({ mode: "last", now, lastRunOk: false, lastPeriodsDay: "2026-10-18" }).mode,
    "periods",
  );
  assert.equal(
    chooseRequest({ mode: "last", now, lastRunOk: true, lastPeriodsDay: "2026-10-17" }).mode,
    "periods",
  );
});

test("token never leaks from URLs or errors", async () => {
  const token = "SECRET-token_123";
  assert.ok(fioUrl(token, { mode: "last" }).includes(token));
  assert.equal(redact(`GET /last/${token}/x failed`, token), "GET /last/***/x failed");
  const fail = (status: number, body = "") =>
    (async () => new Response(body, { status })) as unknown as typeof fetch;
  const r409 = await fetchFio(token, { mode: "last" }, fail(409));
  assert.equal(!r409.ok && r409.kind, "rate_limit");
  const r401 = await fetchFio(token, { mode: "last" }, fail(401));
  assert.equal(!r401.ok && r401.kind, "auth");
  const r500 = await fetchFio(token, { mode: "last" }, fail(500, `invalid token ${token}`));
  assert.equal(!r500.ok && r500.kind, "auth");
  assert.ok(!r500.ok && !r500.error.includes(token));
  const boom = (async () => {
    throw new Error(`connect ${token}`);
  }) as unknown as typeof fetch;
  const net = await fetchFio(token, { mode: "last" }, boom);
  assert.ok(!net.ok && !net.error.includes(token));
  const ok = (async () => Response.json(fixture)) as unknown as typeof fetch;
  const good = await fetchFio(token, { mode: "periods", from: "2026-10-01", to: "2026-10-18" }, ok);
  assert.equal(good.ok && good.transactions.length, 2);
});
