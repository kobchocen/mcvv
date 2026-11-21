/**
 * Dotazy z kontaktního formuláře (#205): uložení, seznam a detail pro administraci,
 * odpověď e-mailem přes frontu pošty (Reply-To = pořadatelský e-mail) a změna stavu.
 */
import type { SessionUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit/log";
import { prisma } from "@/lib/db/client";
import { enqueueMail } from "@/lib/mail/queue";
import { getOrganizerEmail } from "@/lib/settings/messages";
import { siteUrl } from "@/lib/site/url";

import type { ContactInput } from "./guard";
import {
  QUESTION_PAGE_SIZE,
  normalizeReply,
  questionLocale,
  renderQuestionReply,
  statusAfterReply,
  statusesFor,
  type QuestionFilter,
  type QuestionStatus,
} from "./questions-core";

function actor(session: SessionUser) {
  return { id: session.id, email: session.email, role: session.role };
}

function authorName(session: SessionUser): string {
  return (session.name?.trim() || session.email).slice(0, 80);
}

/** Uloží dotaz nepřihlášeného návštěvníka (vstup už prošel `validateContactInput`). */
export async function createContactQuestion(input: ContactInput, locale: string) {
  return prisma.contactQuestion.create({
    data: {
      name: input.name.slice(0, 100),
      email: input.email.slice(0, 254),
      message: input.message,
      locale: questionLocale(locale),
    },
    select: { id: true },
  });
}

export async function markQuestionNotified(id: number, at = new Date()) {
  await prisma.contactQuestion.update({ where: { id }, data: { notifiedAt: at } });
}

export async function listContactQuestions(filter: QuestionFilter) {
  const q = filter.q;
  return prisma.contactQuestion.findMany({
    where: {
      status: { in: statusesFor(filter.status) },
      ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: QUESTION_PAGE_SIZE,
    include: { _count: { select: { replies: true } } },
  });
}

export async function countNewQuestions(): Promise<number> {
  return prisma.contactQuestion.count({ where: { status: "new" } });
}

export async function loadContactQuestion(id: number) {
  return prisma.contactQuestion.findUnique({
    where: { id },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
}

export type ReplyResult = "ok" | "not_found" | "invalid";

/** Odpověď pořadatele: e-mail do fronty (Reply-To pořadatel), záznam odpovědi, stav „zodpovězeno“. */
export async function replyToQuestion(
  session: SessionUser,
  id: number,
  rawBody: unknown,
  now = new Date(),
): Promise<ReplyResult> {
  const body = normalizeReply(rawBody);
  if (!body) return "invalid";
  const question = await prisma.contactQuestion.findUnique({ where: { id } });
  if (!question) return "not_found";
  const mail = renderQuestionReply({ question, body, site: siteUrl() });
  const queued = await enqueueMail({
    ...mail,
    to: question.email,
    replyTo: await getOrganizerEmail(),
    kind: "contact",
    dedupeKey: `contact-reply:${question.id}:${now.getTime()}`,
  });
  await prisma.$transaction(async (db) => {
    await db.contactReply.create({
      data: {
        questionId: question.id,
        body,
        authorId: session.id,
        authorName: authorName(session),
        mailQueueId: queued.id,
        createdAt: now,
      },
    });
    await db.contactQuestion.update({
      where: { id: question.id },
      data: { status: statusAfterReply(), lastReplyAt: now, closedAt: null },
    });
    await writeAudit(
      {
        actor: actor(session),
        action: "contact_question.replied",
        target: `contact_question:${question.id}`,
        detail: { length: body.length, mailQueueId: queued.id },
      },
      db,
    );
  });
  return "ok";
}

export async function setQuestionStatus(
  session: SessionUser,
  id: number,
  status: QuestionStatus,
  now = new Date(),
): Promise<boolean> {
  const question = await prisma.contactQuestion.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!question) return false;
  if (question.status === status) return true;
  await prisma.$transaction(async (db) => {
    await db.contactQuestion.update({
      where: { id },
      data: { status, closedAt: status === "closed" ? now : null },
    });
    await writeAudit(
      {
        actor: actor(session),
        action: "contact_question.status",
        target: `contact_question:${id}`,
        detail: { from: question.status, to: status },
      },
      db,
    );
  });
  return true;
}
