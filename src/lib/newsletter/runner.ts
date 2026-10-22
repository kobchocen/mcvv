import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/client";
import { mailPolicy, pendingPriority1 } from "@/lib/mail/queue";
import { newsletterBudget } from "@/lib/mail/queue-core";
import { prismaMailQueueStore } from "@/lib/mail/queue-store";

import {
  processBatch,
  renderNewsletter,
  unsubscribeHeaders,
  unsubscribeUrl,
  type BatchOutcome,
} from "./core";
import { campaignBanner } from "./banner";
import { newsletterOrigin } from "./origin";
import { prismaNewsletterStore } from "./store";
import { NEWSLETTER_BATCH_SIZE, newsletterDryRun, sendNewsletterBatch } from "./transport";

/**
 * Jedna dávka kampaně v rámci denního rozpočtu e-mailů (nejnižší priorita).
 * Volá ji admin (klientská smyčka) i plánovaný cron – po vyčerpání limitu se pokračuje další den.
 */
export async function runNewsletterBatch(id: number): Promise<BatchOutcome> {
  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (!campaign || campaign.status !== "sending") {
    throw new Error("Kampaň se neodesílá.");
  }
  const now = new Date();
  const day = await prismaMailQueueStore.dayState(now);
  const budget = newsletterBudget(day, mailPolicy(), await pendingPriority1(now));
  if (budget <= 0) {
    return {
      counts: await prismaNewsletterStore.counts(id),
      done: false,
      sent: 0,
      retryAfterMs: 0,
      paused: day.quotaExceeded ? "quota" : "cap",
      error: "Denní limit e-mailů vyčerpán – odesílání pokračuje automaticky další den.",
    };
  }
  const origin = await newsletterOrigin();
  const dryRun = newsletterDryRun();
  const banner = campaignBanner(campaign, origin);
  const outcome = await processBatch({
    campaignId: id,
    batchSize: Math.min(NEWSLETTER_BATCH_SIZE, budget),
    store: prismaNewsletterStore,
    claimToken: randomUUID(),
    render: (email, token) => ({
      ...renderNewsletter({
        subject: campaign.subject,
        body: campaign.body,
        unsubscribeUrl: unsubscribeUrl(origin, token),
        siteUrl: origin,
        banner,
      }),
      to: email,
      headers: unsubscribeHeaders(origin, token),
    }),
    send: (messages, key) => sendNewsletterBatch(messages, key, { dryRun }),
  });
  if (outcome.error && /kvóta/.test(outcome.error)) {
    await prismaMailQueueStore.markQuotaExceeded(now);
    outcome.paused = "quota";
  }
  if (outcome.done) {
    await prisma.newsletterCampaign.updateMany({
      where: { id, status: "sending" },
      data: { status: "sent", sentAt: new Date() },
    });
  }
  return outcome;
}

/** Cron: pokračovat ve všech rozeslaných kampaních, dokud to dovolí rozpočet. */
export async function continueNewsletters(maxBatches = 4) {
  const campaigns = await prisma.newsletterCampaign.findMany({
    where: { status: "sending" },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  let sent = 0;
  let paused: BatchOutcome["paused"];
  let batches = 0;
  for (const { id } of campaigns) {
    while (batches < maxBatches) {
      batches += 1;
      const outcome = await runNewsletterBatch(id);
      sent += outcome.sent;
      if (outcome.paused) {
        paused = outcome.paused;
        return { sent, paused, campaigns: campaigns.length };
      }
      if (outcome.done || outcome.sent === 0) break;
    }
  }
  return { sent, paused, campaigns: campaigns.length };
}
