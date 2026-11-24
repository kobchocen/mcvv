import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addFinishBib,
  addFinishPunch,
  applyFinishAck,
  countFinish,
  deleteFinishRecord,
  dueFinishStations,
  EMPTY_FINISH_QUEUE,
  nextFinishBatch,
  otherStationPending,
  reviveFinishQueue,
  scheduleFinishRetry,
} from "./finish-queue-core";

let n = 0;
const id = () => `id-${String(++n).padStart(4, "0")}`;
const T = Date.UTC(2026, 11, 6, 10, 0, 0);

test("punches and bibs queue up in order and survive a retry", () => {
  let q = addFinishPunch(EMPTY_FINISH_QUEUE, T, id);
  q = addFinishPunch(q, T + 400, id);
  q = addFinishBib(q, 12, T + 900, id);
  q = addFinishBib(q, 0, T + 950, id); // invalid → ignored
  assert.equal(q.outbox.length, 3);
  assert.deepEqual(
    nextFinishBatch(q).map((op) => op.kind),
    ["punch", "punch", "bib"],
  );
  const retry = scheduleFinishRetry(q, T);
  assert.equal(retry.outbox.length, 3);
  assert.equal(retry.nextAttemptAt, T + 1000);
  assert.equal(scheduleFinishRetry(retry, T).nextAttemptAt, T + 2000);
});

test("ack removes sent ops and marks records; rejected keeps the reason", () => {
  let q = addFinishPunch(EMPTY_FINISH_QUEUE, T, id);
  q = addFinishPunch(q, T + 1, id);
  const [a, b] = q.outbox;
  q = applyFinishAck(q, [
    { id: a.id, outcome: "applied" },
    { id: b.id, outcome: "rejected", note: "stale" },
  ]);
  assert.equal(q.outbox.length, 0);
  assert.equal(q.records.find((r) => r.id === a.id)!.state, "applied");
  assert.equal(q.records.find((r) => r.id === b.id)!.note, "stale");
  assert.deepEqual(countFinish(q, "punch"), { total: 1, pending: 0, rejected: 1 });
});

test("deleting an unsent record drops it locally, a sent one queues a delete op", () => {
  let q = addFinishPunch(EMPTY_FINISH_QUEUE, T, id);
  const first = q.records[0].id;
  q = deleteFinishRecord(q, first, id);
  assert.equal(q.outbox.length, 0);
  assert.equal(q.records[0].state, "deleted");

  q = addFinishBib(q, 5, T, id);
  const sent = q.records[0].id;
  q = applyFinishAck(q, [{ id: sent, outcome: "applied" }]);
  q = deleteFinishRecord(q, sent, id);
  assert.deepEqual(q.outbox[0], { kind: "delete", id: q.outbox[0].id, target: sent });
  // in-flight create: delete must go to the server as well
  let r = addFinishPunch(EMPTY_FINISH_QUEUE, T, id);
  const flying = r.records[0].id;
  r = deleteFinishRecord(r, flying, id, new Set([flying]));
  assert.equal(r.outbox.length, 2);
});

test("reviveFinishQueue tolerates garbage", () => {
  assert.deepEqual(reviveFinishQueue(null), EMPTY_FINISH_QUEUE);
  assert.deepEqual(reviveFinishQueue({ records: "x" }).records, []);
});

test("odesílají se fronty obou stanic, zvolená první (#366)", () => {
  const watch = addFinishPunch(EMPTY_FINISH_QUEUE, 1000, id);
  const bibs = addFinishBib(EMPTY_FINISH_QUEUE, 12, 1100, id);
  assert.deepEqual(dueFinishStations({ watch, bibs }, 5000, "bibs"), ["bibs", "watch"]);
  assert.deepEqual(dueFinishStations({ watch, bibs }, 5000, "watch"), ["watch", "bibs"]);
  // jen nezvolená stanice má co odeslat
  assert.deepEqual(dueFinishStations({ watch, bibs: EMPTY_FINISH_QUEUE }, 5000, "bibs"), ["watch"]);
  // po výpadku čeká každá fronta na svůj další pokus
  const waiting = scheduleFinishRetry(watch, 5000);
  assert.deepEqual(dueFinishStations({ watch: waiting, bibs }, 5500, "bibs"), ["bibs"]);
  assert.deepEqual(dueFinishStations({ watch: waiting, bibs }, 6000, "bibs"), ["bibs", "watch"]);
  assert.deepEqual(
    dueFinishStations({ watch: EMPTY_FINISH_QUEUE, bibs: EMPTY_FINISH_QUEUE }, 5000, "watch"),
    [],
  );
});

test("hlavička ukazuje čekající zápisy druhé stanice (#366)", () => {
  const watch = addFinishPunch(addFinishPunch(EMPTY_FINISH_QUEUE, 1000, id), 1200, id);
  assert.deepEqual(otherStationPending({ watch, bibs: EMPTY_FINISH_QUEUE }, "bibs"), {
    station: "watch",
    count: 2,
  });
  assert.equal(otherStationPending({ watch, bibs: EMPTY_FINISH_QUEUE }, "watch"), null);
  assert.equal(
    otherStationPending({ watch: EMPTY_FINISH_QUEUE, bibs: EMPTY_FINISH_QUEUE }, "bibs"),
    null,
  );
});
