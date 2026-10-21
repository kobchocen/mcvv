import assert from "node:assert/strict";
import { test } from "node:test";

import type { WebEntry } from "./ingest-core";
import {
  addPunch,
  applyAck,
  backoffMs,
  clockSample,
  correctBib,
  deleteRecord,
  EMPTY_QUEUE,
  findActiveBib,
  markFailed,
  nextBatch,
  pickOffset,
  reviveQueue,
  scheduleRetry,
  type QueueState,
  type ServerResult,
} from "./queue-core";

function ids() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

/** Zjednodušený idempotentní server: klíč (bib, split), první vyhrává, UUID se pamatuje. */
function fakeServer() {
  const seen = new Map<string, ServerResult>();
  const splits = new Map<string, { time: number; owner: string }>();
  const owners = new Map<string, string>(); // entry id → split key
  const handle = (entries: WebEntry[]): ServerResult[] =>
    entries.map((entry) => {
      const known = seen.get(entry.id);
      if (known) return known;
      let result: ServerResult;
      if (entry.action !== "create") {
        const key = owners.get(entry.replaces);
        if (key && splits.get(key)?.owner === entry.replaces) splits.delete(key);
      }
      if (entry.action === "delete") {
        result = { id: entry.id, outcome: "deleted" };
      } else {
        const key = `${entry.bib}:${entry.split}`;
        const time = Math.floor(entry.punchedAt / 1000);
        if (splits.has(key)) {
          result = { id: entry.id, outcome: "duplicate", existingTime: splits.get(key)!.time };
        } else {
          splits.set(key, { time, owner: entry.id });
          owners.set(entry.id, key);
          result = { id: entry.id, outcome: "applied", time };
        }
      }
      seen.set(entry.id, result);
      return result;
    });
  return { handle, splits };
}

test("punch → batch → ack", () => {
  const newId = ids();
  let state = addPunch(EMPTY_QUEUE, { split: "1", bib: 41, punchedAt: 1000 }, newId);
  assert.equal(state.records[0].state, "pending");
  assert.equal(nextBatch(state).length, 1);
  assert.ok(!("attempts" in nextBatch(state)[0]));
  state = applyAck(state, [{ id: state.records[0].id, outcome: "applied", time: 61 }]);
  assert.equal(state.outbox.length, 0);
  assert.equal(state.records[0].state, "applied");
  assert.equal(state.records[0].time, 61);
  assert.ok(findActiveBib(state, "1", 41));
  assert.equal(findActiveBib(state, "3", 41), null);
});

test("correcting an unsent entry rewrites the outbox, a sent one adds a correct op", () => {
  const newId = ids();
  let state = addPunch(EMPTY_QUEUE, { split: "1", bib: 41, punchedAt: 1000 }, newId);
  const id = state.records[0].id;
  state = correctBib(state, id, 42, newId);
  assert.equal(state.outbox.length, 1);
  assert.equal((state.outbox[0] as { bib: number }).bib, 42);
  // v letu se upravovat nesmí → oprava jako nová operace
  state = correctBib(state, id, 43, newId, new Set([id]));
  assert.equal(state.outbox.length, 2);
  assert.equal(state.outbox[1].action, "correct");
  assert.equal((state.outbox[1] as { replaces: string }).replaces, id);
  assert.equal(state.records[0].currentKey, state.outbox[1].id);
});

test("delete: unsent create disappears, sent entry gets a delete op", () => {
  const newId = ids();
  let state = addPunch(EMPTY_QUEUE, { split: "1", bib: 41, punchedAt: 1000 }, newId);
  state = deleteRecord(state, state.records[0].id, newId);
  assert.equal(state.outbox.length, 0);
  assert.equal(state.records[0].state, "deleted");

  state = addPunch(EMPTY_QUEUE, { split: "1", bib: 50, punchedAt: 1000 }, newId);
  state = applyAck(state, [{ id: state.records[0].id, outcome: "applied" }]);
  state = deleteRecord(state, state.records[0].id, newId);
  assert.equal(state.outbox.length, 1);
  assert.equal(state.outbox[0].action, "delete");
});

test("draft stamp without bib is not sent until the bib is filled in", () => {
  const newId = ids();
  let state = addPunch(EMPTY_QUEUE, { split: "3", bib: null, punchedAt: 5000 }, newId);
  assert.equal(state.records[0].state, "draft");
  assert.equal(state.outbox.length, 0);
  state = correctBib(state, state.records[0].id, 77, newId);
  assert.equal(state.outbox.length, 1);
  assert.equal(state.outbox[0].action, "create");
  assert.equal((state.outbox[0] as { punchedAt: number }).punchedAt, 5000);
});

test("5 minute outage with lost acks: nothing lost, nothing duplicated", () => {
  const newId = ids();
  const server = fakeServer();
  let state: QueueState = EMPTY_QUEUE;
  let now = 0;
  const online = (t: number) => t < 60_000 || t >= 360_000; // výpadek 1.–6. minuta
  const tick = () => {
    if (state.outbox.length === 0 || now < state.nextAttemptAt) return;
    const batch = nextBatch(state);
    if (!online(now)) {
      state = scheduleRetry(state, now, 0.5);
      return;
    }
    const results = server.handle(batch);
    if (Math.floor(now / 1000) % 7 === 0) {
      // server zápis přijal, ale odpověď se ztratila → klient pošle znovu
      state = scheduleRetry(state, now, 0.5);
      return;
    }
    state = applyAck(state, results);
  };
  for (let bib = 1; bib <= 120; bib++) {
    // běžec každé 3 s, mezi tím tiky po 1 s
    state = addPunch(state, { split: "1", bib, punchedAt: now + 1_000_000 }, newId);
    if (bib === 30) state = correctBib(state, state.records[0].id, 130, newId);
    if (bib === 31)
      state = addPunch(state, { split: "1", bib: 31, punchedAt: now + 1_000_001 }, newId);
    for (let i = 0; i < 3; i++) {
      tick();
      now += 1000;
    }
  }
  for (let i = 0; i < 120 && state.outbox.length > 0; i++) {
    tick();
    now += 1000;
  }
  assert.equal(state.outbox.length, 0, "outbox drained");
  // 120 běžců, č. 30 opravené na 130, č. 31 zapsané dvakrát (druhé = duplicita)
  assert.equal(server.splits.size, 120);
  assert.ok(server.splits.has("130:1"));
  assert.ok(!server.splits.has("30:1"));
  const states = state.records.map((record) => record.state);
  assert.equal(states.filter((s) => s === "applied").length, 120);
  assert.equal(states.filter((s) => s === "duplicate").length, 1);
});

test("failed validation stops retrying, backoff is bounded", () => {
  const newId = ids();
  let state = addPunch(EMPTY_QUEUE, { split: "1", bib: 41, punchedAt: 1000 }, newId);
  state = markFailed(state, [state.records[0].id]);
  assert.equal(state.outbox.length, 0);
  assert.equal(state.records[0].state, "error");
  assert.equal(backoffMs(1, 0.5), 2000);
  assert.equal(backoffMs(20, 0.5), 30_000);
  assert.ok(backoffMs(20, 1) <= 37_500);
});

test("clock offset picks the fastest sample", () => {
  const a = clockSample(1000, 1400, 6200); // rtt 400 → offset 5000
  const b = clockSample(2000, 2100, 7060); // rtt 100 → offset 5010
  assert.equal(pickOffset([a, b]), 5010);
  assert.equal(pickOffset([]), null);
});

test("revive tolerates garbage", () => {
  assert.deepEqual(reviveQueue(null), EMPTY_QUEUE);
  assert.deepEqual(reviveQueue({ records: "x" }).records, []);
});
