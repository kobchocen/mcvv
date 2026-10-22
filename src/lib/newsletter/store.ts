import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";

import {
  audienceFromData,
  currentEntrantEmails,
  promotionOptOuts,
  legacyFromYear,
  type Audience,
  type AudienceData,
  type AudienceOptions,
  type NewsletterStore,
  type RecipientCounts,
} from "./core";
import type { UnsubscribeStore } from "./unsubscribe";

/** Emails registered for the current edition (latest Ročník in admin). */
export async function loadCurrentEntrants(): Promise<{ year: number; emails: Set<string> }> {
  const { year } = await currentRaceYear();
  const rows = await prisma.registration.findMany({
    where: { year },
    select: { email: true, author: true, status: true, lines: { select: { author: true } } },
  });
  return { year, emails: currentEntrantEmails(rows) };
}

/**
 * Jedno načtení všeho, co potřebuje výpočet publika (dřív se pro každou volbu let v nápovědě
 * formuláře načítaly znovu všechny přihlášky – 8× při každém zobrazení / uložení kampaně).
 * `maxYears` = nejdelší období, které se z dat bude počítat.
 */
export async function loadAudienceData(maxYears: number): Promise<AudienceData> {
  const [users, legacy, unsubscribed, promotion, accounts, entrants] = await Promise.all([
    prisma.user.findMany({ where: { emailVerified: { not: null } }, select: { email: true } }),
    maxYears > 0
      ? prisma.registration.findMany({
          // Jen přihlášky s běžci – prázdné (dřív zakládané návštěvou stránky) nejsou zájem o závod.
          where: {
            year: { gte: legacyFromYear(maxYears) },
            email: { contains: "@" },
            lines: { some: {} },
          },
          select: { email: true, year: true },
          distinct: ["email", "year"],
        })
      : Promise.resolve([]),
    prisma.newsletterOptOut.findMany({
      where: { unsubscribedAt: { not: null } },
      select: { email: true },
    }),
    // Souhlas na účtu rozhoduje; bez rozhodnutí účtu platí poslední přihláška (všechny roky).
    prisma.registration.findMany({
      where: { email: { contains: "@" } },
      select: {
        email: true,
        promotion: true,
        year: true,
        created: true,
        id: true,
        _count: { select: { lines: true } },
      },
    }),
    prisma.user.findMany({
      where: { promotionOptOut: { not: null } },
      select: { email: true, promotionOptOut: true },
    }),
    loadCurrentEntrants(),
  ]);
  return {
    userEmails: users.map((u) => u.email),
    legacy: legacy.map((r) => ({ email: r.email, year: r.year })),
    unsubscribed: unsubscribed.map((u) => u.email),
    noPromotion: promotionOptOuts(
      accounts,
      promotion.map(({ _count, ...row }) => ({ ...row, lineCount: _count.lines })),
    ),
    currentEntrants: entrants,
  };
}

export async function loadAudience(options: AudienceOptions): Promise<Audience> {
  return audienceFromData(await loadAudienceData(options.years), options);
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
