import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { getMailPolicy } from "@/lib/settings/mail";

import {
  capAlertMail,
  drainQueue,
  KIND_PRIORITY,
  type DrainOutcome,
  type MailKind,
  type MailPolicy,
} from "./queue-core";
import { prismaMailQueueStore } from "./queue-store";
import { postResendEmail } from "./resend";

export type MailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

/** Denní limit a rezerva: nastavení v administraci → env → 90 / 15 (#190). */
export async function mailPolicy(): Promise<MailPolicy> {
  return getMailPolicy();
}

/** Mimo produkci se ve výchozím stavu nic neodesílá (jen zápis do fronty jako „sent“ + log). */
export function mailDryRun(): boolean {
  if (env.MAIL_DRY_RUN) return env.MAIL_DRY_RUN === "true";
  return env.NODE_ENV !== "production";
}

export async function enqueueMail(
  input: MailInput & { kind: MailKind; dedupeKey?: string; notBefore?: Date },
): Promise<{ id: number; created: boolean }> {
  if (input.dedupeKey) {
    const existing = await prisma.mailQueue.findUnique({
      where: { dedupeKey: input.dedupeKey },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
  }
  const row = await prisma.mailQueue.create({
    data: {
      kind: input.kind,
      priority: KIND_PRIORITY[input.kind],
      toEmail: input.to,
      replyTo: input.replyTo ?? null,
      subject: input.subject.slice(0, 300),
      html: input.html,
      text: input.text,
      dedupeKey: input.dedupeKey ?? null,
      ...(input.notBefore ? { notBefore: input.notBefore } : {}),
    },
    select: { id: true },
  });
  return { id: row.id, created: true };
}

async function drain(ids?: number[], limit = 25): Promise<DrainOutcome> {
  const dryRun = mailDryRun();
  const policy = await mailPolicy();
  const outcome = await drainQueue({
    store: prismaMailQueueStore,
    policy,
    claimToken: randomUUID(),
    limit,
    ids,
    send: (mail) =>
      postResendEmail(
        {
          to: mail.toEmail,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          replyTo: mail.replyTo ?? undefined,
        },
        { dryRun, idempotencyKey: `mcvv-mail-${mail.id}` },
      ),
  });
  if (outcome.capReached || outcome.quotaExceeded)
    await alertCapOnce(outcome.quotaExceeded, policy);
  return outcome;
}

async function alertCapOnce(quota: boolean, policy: MailPolicy) {
  const now = new Date();
  if (!(await prismaMailQueueStore.claimCapAlert(now))) return;
  const day = await prismaMailQueueStore.dayState(now);
  const origin = env.AUTH_ORIGIN ?? "https://www.mcvv.org";
  const mail = capAlertMail({
    cap: policy.cap,
    sentToday: day.sentToday,
    quota,
    adminUrl: `${origin}/cs/admin`,
  });
  const { id } = await enqueueMail({ ...mail, to: env.ALERT_TO, kind: "alert" });
  if (!quota)
    await drainQueue({
      store: prismaMailQueueStore,
      policy,
      claimToken: randomUUID(),
      limit: 1,
      ids: [id],
      send: (m) =>
        postResendEmail(
          { to: m.toEmail, subject: m.subject, html: m.html, text: m.text },
          { dryRun: mailDryRun(), idempotencyKey: `mcvv-mail-${m.id}` },
        ),
    });
}

/**
 * Zařadí e-mail a hned se ho pokusí odeslat (pokud to dovolí denní rozpočet).
 * Vrací "sent" | "queued" (odejde později) | "failed".
 */
export async function sendMail(
  input: MailInput & { kind: MailKind; dedupeKey?: string },
): Promise<"sent" | "queued" | "failed"> {
  const { id } = await enqueueMail(input);
  const outcome = await drain([id], 1);
  if (outcome.sent > 0) return "sent";
  if (outcome.failed > 0) return "failed";
  return "queued";
}

/** Plánovaný běh: odešle čekající e-maily (volá cron route). */
export async function processMailQueue(limit = 40): Promise<DrainOutcome> {
  return drain(undefined, limit);
}

export async function pendingPriority1(now = new Date()) {
  return prismaMailQueueStore.pendingCount(1, now);
}
