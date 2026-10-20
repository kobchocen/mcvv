/**
 * Zápis zpráv (sdílené server akcemi i kontaktním formulářem). Bez "use server" –
 * nic odsud není přímo volatelné z klienta; vstupní body jsou v ./actions.ts.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";

import {
  checkRateLimit,
  patchForMarkRead,
  patchForNewMessage,
  type MessageSide,
  type RateVerdict,
} from "./core";
import { cancelPendingUserNotification } from "./notify";
import { rateUsage } from "./store";

export type PostResult =
  | { ok: true; threadId: number }
  | { ok: false; error: "invalid" | "forbidden" | "disabled" | RateLimitReason };

type RateLimitReason = "rate_hour" | "rate_day" | "rate_threads";

function rateError(verdict: RateVerdict): RateLimitReason | null {
  if (verdict.ok) return null;
  return verdict.reason === "hour"
    ? "rate_hour"
    : verdict.reason === "day"
      ? "rate_day"
      : "rate_threads";
}

export async function checkUserRate(
  session: SessionUser,
  newThread: boolean,
): Promise<RateLimitReason | null> {
  return rateError(checkRateLimit(await rateUsage(session.id), newThread));
}

/** Vlákno k přihlášce (založí, když ještě není). */
export async function ensureRegistrationThread(
  year: number,
  registrationId: number,
  userId: number | null,
): Promise<{ id: number; created: boolean }> {
  const existing = await prisma.messageThread.findUnique({
    where: { year_registrationId: { year, registrationId } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };
  try {
    const created = await prisma.messageThread.create({
      data: { year, registrationId, userId },
      select: { id: true },
    });
    return { id: created.id, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const row = await prisma.messageThread.findUniqueOrThrow({
        where: { year_registrationId: { year, registrationId } },
        select: { id: true },
      });
      return { id: row.id, created: false };
    }
    throw error;
  }
}

/** Uloží zprávu a posune časové značky vlákna (odpověď = přečteno pro autorovu stranu). */
export async function appendMessage(input: {
  threadId: number;
  side: MessageSide;
  authorUserId: number | null;
  body: string;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId: input.threadId,
        side: input.side,
        authorUserId: input.authorUserId,
        body: input.body,
        createdAt: now,
      },
    }),
    prisma.messageThread.update({
      where: { id: input.threadId },
      data: patchForNewMessage(input.side, now),
    }),
  ]);
  if (input.side === "user") {
    await cancelPendingUserNotification(input.threadId);
  }
}

export async function markRead(threadId: number, side: MessageSide, now = new Date()) {
  await prisma.messageThread.update({
    where: { id: threadId },
    data: patchForMarkRead(side, now),
  });
  if (side === "user") {
    await cancelPendingUserNotification(threadId);
  }
}

/** Obecné vlákno pod účtem (kontaktní formulář přihlášeného uživatele). */
export async function createGeneralThread(
  session: SessionUser,
  subject: string,
  body: string,
): Promise<PostResult> {
  const limited = await checkUserRate(session, true);
  if (limited) return { ok: false, error: limited };
  const thread = await prisma.messageThread.create({
    data: { userId: session.id, subject },
    select: { id: true },
  });
  await appendMessage({ threadId: thread.id, side: "user", authorUserId: session.id, body });
  return { ok: true, threadId: thread.id };
}
