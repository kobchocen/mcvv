import { prisma } from "@/lib/db/client";

import {
  MAX_ATTEMPTS,
  utcDayStart,
  utcMonthStart,
  type MailQueueStore,
  type QueuedMail,
} from "./queue-core";

/** Odesláno v intervalu = fronta + newsletter (oba čerpají stejnou kvótu Resend). */
export async function sentBetween(from: Date, to: Date): Promise<number> {
  const [queue, newsletter] = await Promise.all([
    prisma.mailQueue.count({ where: { status: "sent", sentAt: { gte: from, lt: to } } }),
    prisma.newsletterRecipient.count({ where: { status: "sent", sentAt: { gte: from, lt: to } } }),
  ]);
  return queue + newsletter;
}

export async function mailStats(now = new Date()) {
  const far = new Date(now.getTime() + 60_000);
  const [today, month, pending, failed, day] = await Promise.all([
    sentBetween(utcDayStart(now), far),
    sentBetween(utcMonthStart(now), far),
    prisma.mailQueue.count({ where: { status: { in: ["pending", "sending"] } } }),
    prisma.mailQueue.count({ where: { status: "failed" } }),
    prisma.mailDay.findUnique({ where: { day: utcDayStart(now) } }),
  ]);
  return { today, month, pending, failed, quotaExceeded: Boolean(day?.quotaExceededAt) };
}

const select = {
  id: true,
  kind: true,
  priority: true,
  toEmail: true,
  replyTo: true,
  subject: true,
  html: true,
  text: true,
  attempts: true,
} as const;

export const prismaMailQueueStore: MailQueueStore = {
  async dayState(now) {
    const [sentToday, day] = await Promise.all([
      sentBetween(utcDayStart(now), new Date(now.getTime() + 60_000)),
      prisma.mailDay.findUnique({ where: { day: utcDayStart(now) } }),
    ]);
    return { sentToday, quotaExceeded: Boolean(day?.quotaExceededAt) };
  },
  async releaseStale(olderThan) {
    // Na rozdíl od newsletteru jde o jednotlivé e-maily s idempotency klíčem → bezpečné vrátit.
    const result = await prisma.mailQueue.updateMany({
      where: { status: "sending", claimedAt: { lt: olderThan } },
      data: { status: "pending", claimToken: null },
    });
    return result.count;
  },
  async claim({ limit, maxPriority, ids, claimToken, now }) {
    const candidates = await prisma.mailQueue.findMany({
      where: {
        status: "pending",
        priority: { lte: maxPriority },
        notBefore: { lte: now },
        ...(ids ? { id: { in: ids } } : {}),
      },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true },
    });
    if (!candidates.length) return [];
    await prisma.mailQueue.updateMany({
      where: { id: { in: candidates.map((c) => c.id) }, status: "pending" },
      data: { status: "sending", claimToken, claimedAt: now },
    });
    const rows = await prisma.mailQueue.findMany({
      where: { claimToken, status: "sending" },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
      select,
    });
    return rows as QueuedMail[];
  },
  async markSent(id, providerId, now) {
    await prisma.mailQueue.update({
      where: { id },
      data: { status: "sent", providerId, sentAt: now, claimToken: null, lastError: null },
    });
  },
  async defer(id, { notBefore, error, countAttempt }) {
    const row = await prisma.mailQueue.update({
      where: { id },
      data: {
        status: "pending",
        notBefore,
        claimToken: null,
        lastError: error.slice(0, 500),
        ...(countAttempt ? { attempts: { increment: 1 } } : {}),
      },
      select: { attempts: true },
    });
    if (row.attempts >= MAX_ATTEMPTS) {
      await prisma.mailQueue.update({ where: { id }, data: { status: "failed" } });
    }
  },
  async markFailed(id, error) {
    await prisma.mailQueue.update({
      where: { id },
      data: {
        status: "failed",
        claimToken: null,
        lastError: error.slice(0, 500),
        attempts: { increment: 1 },
      },
    });
  },
  async markQuotaExceeded(now) {
    const day = utcDayStart(now);
    await prisma.mailDay.upsert({
      where: { day },
      create: { day, quotaExceededAt: now },
      update: { quotaExceededAt: now },
    });
  },
  async claimCapAlert(now) {
    const day = utcDayStart(now);
    await prisma.mailDay.upsert({ where: { day }, create: { day }, update: {} });
    const result = await prisma.mailDay.updateMany({
      where: { day, capAlertSentAt: null },
      data: { capAlertSentAt: now },
    });
    return result.count === 1;
  },
  async pendingCount(maxPriority, now) {
    return prisma.mailQueue.count({
      where: { status: "pending", priority: { lte: maxPriority }, notBefore: { lte: now } },
    });
  },
};
