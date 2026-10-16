import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db/client";

import {
  buildAudience,
  legacyFromYear,
  type Audience,
  type AudienceOptions,
  type NewsletterStore,
  type RecipientCounts,
} from "./core";
import type { UnsubscribeStore } from "./unsubscribe";

export async function loadAudience(options: AudienceOptions): Promise<Audience> {
  const [users, legacy, unsubscribed] = await Promise.all([
    options.users
      ? prisma.user.findMany({ where: { emailVerified: { not: null } }, select: { email: true } })
      : Promise.resolve([]),
    options.years > 0
      ? prisma.registration.findMany({
          where: { year: { gte: legacyFromYear(options.years) }, email: { contains: "@" } },
          select: { email: true },
          distinct: ["email"],
        })
      : Promise.resolve([]),
    prisma.newsletterOptOut.findMany({
      where: { unsubscribedAt: { not: null } },
      select: { email: true },
    }),
  ]);
  return buildAudience(
    {
      userEmails: users.map((u) => u.email),
      legacyEmails: legacy.map((r) => r.email),
      unsubscribed: unsubscribed.map((u) => u.email),
    },
    options,
  );
}

/** Ensure each email has a stable unsubscribe token. */
export async function ensureOptOutTokens(emails: string[]): Promise<void> {
  for (let i = 0; i < emails.length; i += 500) {
    const chunk = emails.slice(i, i + 500);
    await prisma.newsletterOptOut.createMany({
      data: chunk.map((email) => ({ email, token: randomBytes(32).toString("hex") })),
      skipDuplicates: true,
    });
  }
}

export async function tokenFor(email: string): Promise<string> {
  await ensureOptOutTokens([email]);
  const row = await prisma.newsletterOptOut.findUniqueOrThrow({ where: { email } });
  return row.token;
}

export async function recipientCounts(campaignId: number): Promise<RecipientCounts> {
  const grouped = await prisma.newsletterRecipient.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });
  const counts: RecipientCounts = {
    pending: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    total: 0,
  };
  for (const row of grouped) {
    counts[row.status] = row._count._all;
    counts.total += row._count._all;
  }
  return counts;
}

export const prismaNewsletterStore: NewsletterStore = {
  async claim(campaignId, limit, claimToken, now) {
    const candidates = await prisma.newsletterRecipient.findMany({
      where: { campaignId, status: "pending" },
      orderBy: { id: "asc" },
      take: limit,
      select: { id: true },
    });
    if (!candidates.length) return [];
    // Conditional update: a concurrent worker that already claimed a row wins.
    await prisma.newsletterRecipient.updateMany({
      where: { id: { in: candidates.map((c) => c.id) }, status: "pending" },
      data: { status: "sending", claimToken, claimedAt: now },
    });
    return prisma.newsletterRecipient.findMany({
      where: { campaignId, claimToken, status: "sending" },
      orderBy: { id: "asc" },
      select: { id: true, email: true },
    });
  },
  async failStale(campaignId, olderThan) {
    const result = await prisma.newsletterRecipient.updateMany({
      where: { campaignId, status: "sending", claimedAt: { lt: olderThan } },
      data: { status: "failed", error: "přerušené odeslání – stav neznámý, ověřte v Resend" },
    });
    return result.count;
  },
  async unsubscribed(emails) {
    const rows = await prisma.newsletterOptOut.findMany({
      where: { email: { in: emails }, unsubscribedAt: { not: null } },
      select: { email: true },
    });
    return new Set(rows.map((r) => r.email));
  },
  async tokens(emails) {
    const rows = await prisma.newsletterOptOut.findMany({
      where: { email: { in: emails } },
      select: { email: true, token: true },
    });
    return new Map(rows.map((r) => [r.email, r.token]));
  },
  async markSent(rows, now) {
    await prisma.$transaction(
      rows.map((row) =>
        prisma.newsletterRecipient.update({
          where: { id: row.id },
          data: { status: "sent", sentAt: now, providerId: row.providerId, error: null },
        }),
      ),
    );
  },
  async markFailed(ids, error) {
    await prisma.newsletterRecipient.updateMany({
      where: { id: { in: ids } },
      data: { status: "failed", error },
    });
  },
  async markSkipped(ids) {
    await prisma.newsletterRecipient.updateMany({
      where: { id: { in: ids } },
      data: { status: "skipped", error: "odhlášen z odběru" },
    });
  },
  async release(ids) {
    await prisma.newsletterRecipient.updateMany({
      where: { id: { in: ids } },
      data: { status: "pending", claimToken: null, claimedAt: null },
    });
  },
  counts: recipientCounts,
};

export const prismaUnsubscribeStore: UnsubscribeStore = {
  find: (token) =>
    prisma.newsletterOptOut.findUnique({ where: { token }, select: { unsubscribedAt: true } }),
  async mark(token, at) {
    await prisma.newsletterOptOut.updateMany({
      where: { token, unsubscribedAt: null },
      data: { unsubscribedAt: at },
    });
  },
};
