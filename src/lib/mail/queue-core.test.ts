import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyResendFailure,
  drainQueue,
  newsletterBudget,
  nextUtcDay,
  remainingBudget,
  type DayState,
  type MailQueueStore,
  type QueuedMail,
  type SendResult,
} from "./queue-core";

const policy = { cap: 90, reserve: 15 };

test("remainingBudget keeps a reserve for priority 0 and lets alerts go to the provider limit", () => {
  const day: DayState = { sentToday: 75, quotaExceeded: false };
  assert.equal(remainingBudget(1, day, policy), 0);
  assert.equal(remainingBudget(2, day, policy), 0);
  assert.equal(remainingBudget(0, day, policy), 15);
  assert.equal(remainingBudget(0, { sentToday: 90, quotaExceeded: false }, policy), 0);
  assert.equal(remainingBudget(0, { sentToday: 90, quotaExceeded: false }, policy, "alert"), 8);
  assert.equal(remainingBudget(0, { sentToday: 0, quotaExceeded: true }, policy, "alert"), 0);
});

test("newsletterBudget leaves room for queued priority-1 mail", () => {
  assert.equal(newsletterBudget({ sentToday: 10, quotaExceeded: false }, policy, 5), 60);
  assert.equal(newsletterBudget({ sentToday: 70, quotaExceeded: false }, policy, 10), 0);
});

test("classifyResendFailure separates quota, rate limit, server and client errors", () => {
  const quota = classifyResendFailure(429, '{"name":"daily_quota_exceeded"}');
  assert.equal(!quota.ok && quota.kind, "quota");
  const rate = classifyResendFailure(429, '{"name":"rate_limit_exceeded"}');
  assert.equal(!rate.ok && rate.kind, "retryable");
  const server = classifyResendFailure(503, "");
  assert.equal(!server.ok && server.kind, "retryable");
  const bad = classifyResendFailure(422, "invalid to");
  assert.equal(!bad.ok && bad.kind, "permanent");
});

test("nextUtcDay returns the next UTC midnight", () => {
  assert.equal(
    nextUtcDay(new Date("2026-10-18T23:30:00+02:00")).toISOString(),
    "2026-10-19T00:00:00.000Z",
  );
  assert.equal(
    nextUtcDay(new Date("2026-10-19T00:30:00+02:00")).toISOString(),
    "2026-10-19T00:00:00.000Z",
  );
});

type Row = QueuedMail & {
  status: "pending" | "sending" | "sent" | "failed";
  notBefore: Date;
  claimToken: string | null;
};

function memoryStore(rows: Row[], day: DayState = { sentToday: 0, quotaExceeded: false }) {
  const state = { ...day, capAlerts: 0 };
  const store: MailQueueStore = {
    async dayState() {
      return { sentToday: state.sentToday, quotaExceeded: state.quotaExceeded };
    },
    async releaseStale() {
      return 0;
    },
    async claim({ limit, maxPriority, ids, claimToken, now }) {
      const picked = rows
        .filter(
          (r) =>
            r.status === "pending" &&
            r.priority <= maxPriority &&
            r.notBefore <= now &&
            (!ids || ids.includes(r.id)),
        )
        .sort((a, b) => a.priority - b.priority || a.id - b.id)
        .slice(0, limit);
      for (const r of picked) {
        r.status = "sending";
        r.claimToken = claimToken;
      }
      return picked;
    },
    async markSent(id) {
      rows.find((r) => r.id === id)!.status = "sent";
      state.sentToday += 1;
    },
    async defer(id, { notBefore, countAttempt }) {
      const r = rows.find((x) => x.id === id)!;
      r.status = "pending";
      r.notBefore = notBefore;
      if (countAttempt) r.attempts += 1;
    },
    async markFailed(id) {
      rows.find((r) => r.id === id)!.status = "failed";
    },
    async markQuotaExceeded() {
      state.quotaExceeded = true;
    },
    async claimCapAlert() {
      state.capAlerts += 1;
      return state.capAlerts === 1;
    },
    async pendingCount(maxPriority, now) {
      return rows.filter(
        (r) => r.status === "pending" && r.priority <= maxPriority && r.notBefore <= now,
      ).length;
    },
  };
  return { store, state };
}

function row(
  id: number,
  priority: 0 | 1,
  kind: QueuedMail["kind"] = priority ? "reminder" : "confirmation",
): Row {
  return {
    id,
    kind,
    priority,
    toEmail: `r${id}@example.test`,
    replyTo: null,
    subject: `s${id}`,
    html: "",
    text: "",
    attempts: 0,
    status: "pending",
    notBefore: new Date("2026-01-01T00:00:00Z"),
    claimToken: null,
  };
}

const now = new Date("2026-10-18T10:00:00Z");
const okSend = async (): Promise<SendResult> => ({ ok: true, providerId: "x" });

test("drainQueue sends priority 0 first and stops priority 1 at cap minus reserve", async () => {
  const rows = [row(1, 1), row(2, 1), row(3, 0)];
  const { store } = memoryStore(rows, { sentToday: 73, quotaExceeded: false });
  const sent: number[] = [];
  const outcome = await drainQueue({
    store,
    policy,
    claimToken: "t",
    limit: 10,
    now,
    send: async (m) => {
      sent.push(m.id);
      return okSend();
    },
  });
  assert.deepEqual(sent, [3, 1]);
  assert.equal(outcome.sent, 2);
  assert.equal(outcome.capReached, true);
  assert.equal(rows[1].status, "pending");
  assert.equal(rows[1].notBefore.toISOString(), "2026-10-19T00:00:00.000Z");
});

test("drainQueue keeps mail queued until the next day on a Resend quota error", async () => {
  const rows = [row(1, 0), row(2, 0)];
  const { store, state } = memoryStore(rows);
  const outcome = await drainQueue({
    store,
    policy,
    claimToken: "t",
    limit: 10,
    now,
    send: async () => classifyResendFailure(429, "daily_quota_exceeded"),
  });
  assert.equal(outcome.quotaExceeded, true);
  assert.equal(state.quotaExceeded, true);
  assert.ok(rows.every((r) => r.status === "pending" && r.attempts === 0));
  assert.ok(rows.every((r) => r.notBefore.toISOString() === "2026-10-19T00:00:00.000Z"));
  // Další běh téhož dne nic nezkouší.
  let called = false;
  await drainQueue({
    store,
    policy,
    claimToken: "t2",
    limit: 10,
    now,
    send: async () => ((called = true), okSend()),
  });
  assert.equal(called, false);
});

test("drainQueue retries transient errors and fails permanent ones, never sending twice", async () => {
  const rows = [row(1, 0), row(2, 0)];
  const { store } = memoryStore(rows);
  await drainQueue({
    store,
    policy,
    claimToken: "t",
    limit: 10,
    now,
    send: async (m) =>
      m.id === 1 ? classifyResendFailure(503, "") : classifyResendFailure(422, "bad"),
  });
  assert.equal(rows[0].status, "pending");
  assert.equal(rows[0].attempts, 1);
  assert.equal(rows[1].status, "failed");
  const later = new Date(now.getTime() + 16 * 60 * 1000);
  const sent: number[] = [];
  await drainQueue({
    store,
    policy,
    claimToken: "t2",
    limit: 10,
    now: later,
    send: async (m) => (sent.push(m.id), okSend()),
  });
  await drainQueue({
    store,
    policy,
    claimToken: "t3",
    limit: 10,
    now: later,
    send: async (m) => (sent.push(m.id), okSend()),
  });
  assert.deepEqual(sent, [1]);
});

test("drainQueue with ids only touches the given mail", async () => {
  const rows = [row(1, 0), row(2, 0)];
  const { store } = memoryStore(rows);
  await drainQueue({ store, policy, claimToken: "t", limit: 1, ids: [2], now, send: okSend });
  assert.equal(rows[0].status, "pending");
  assert.equal(rows[1].status, "sent");
});

test("unlimited policy (#190) lifts the app cap but still stops on a Resend quota error", async () => {
  const unlimited = { ...policy, unlimited: true };
  const busy: DayState = { sentToday: 500, quotaExceeded: false };
  assert.equal(remainingBudget(1, busy, unlimited), Number.POSITIVE_INFINITY);
  assert.equal(remainingBudget(0, busy, unlimited, "alert"), Number.POSITIVE_INFINITY);
  assert.equal(newsletterBudget(busy, unlimited, 10), Number.POSITIVE_INFINITY);
  assert.equal(remainingBudget(1, { sentToday: 0, quotaExceeded: true }, unlimited), 0);

  const rows = [row(1, 1), row(2, 1), row(3, 0)];
  const { store } = memoryStore(rows, busy);
  const outcome = await drainQueue({
    store,
    policy: unlimited,
    claimToken: "t",
    limit: 2,
    now,
    send: okSend,
  });
  assert.equal(outcome.sent, 2);
  assert.equal(outcome.capReached, false);
  assert.equal(rows[2].status, "sent");
});
