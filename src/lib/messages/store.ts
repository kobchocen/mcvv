import { cache } from "react";

import { prisma } from "@/lib/db/client";
import { getSession, isStaffRole, type SessionUser } from "@/lib/auth/session";
import { getMessageSettings } from "@/lib/settings/messages";

import {
  countUnreadMessages,
  countUnreadThreads,
  emailMatches,
  hasUnread,
  type AdminThreadFilters,
  type MessageSide,
} from "./core";

export type ThreadKey = { year: number; registrationId: number };

const regKey = (year: number, id: number) => `${year}/${id}`;

/** Přihlášky účtu (e-mail přihlášky = e-mail účtu, stejně jako /prihlasky). */
export async function userRegistrations(email: string) {
  const rows = await prisma.registration.findMany({
    where: { email: { equals: email } },
    select: { year: true, id: true, name: true, email: true },
    orderBy: [{ year: "desc" }, { id: "asc" }],
  });
  return rows.filter((row) => emailMatches(row.email, email));
}

function userThreadWhere(session: SessionUser, regs: { year: number; id: number }[]) {
  return {
    OR: [
      { userId: session.id, registrationId: null },
      ...regs.map((reg) => ({ year: reg.year, registrationId: reg.id })),
    ],
  };
}

/** Všechna vlákna přihlašujícího (obecná + k jeho přihláškám), nejnovější nahoře. */
export async function listUserThreads(session: SessionUser) {
  const regs = await userRegistrations(session.email);
  const threads = await prisma.messageThread.findMany({
    where: userThreadWhere(session, regs),
    orderBy: { lastMessageAt: "desc" },
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, side: true } },
    },
  });
  const names = new Map(regs.map((reg) => [regKey(reg.year, reg.id), reg.name]));
  return threads.map((thread) => ({
    ...thread,
    registrationName:
      thread.year !== null && thread.registrationId !== null
        ? (names.get(regKey(thread.year, thread.registrationId)) ?? null)
        : null,
    unread: hasUnread(thread, "user"),
  }));
}

/** Smí přihlašující vlákno číst / psát do něj? */
export async function userCanAccessThread(
  thread: { userId: number | null; year: number | null; registrationId: number | null },
  session: SessionUser,
): Promise<boolean> {
  if (thread.year !== null && thread.registrationId !== null) {
    const reg = await prisma.registration.findUnique({
      where: { year_id: { year: thread.year, id: thread.registrationId } },
      select: { email: true },
    });
    return emailMatches(reg?.email, session.email);
  }
  return thread.userId === session.id;
}

const threadDetailInclude = {
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { name: true } } },
  },
  user: { select: { id: true, name: true, email: true } },
};

export async function loadThread(id: number) {
  return prisma.messageThread.findUnique({ where: { id }, include: threadDetailInclude });
}

export async function loadRegistrationThread(year: number, registrationId: number) {
  return prisma.messageThread.findUnique({
    where: { year_registrationId: { year, registrationId } },
    include: threadDetailInclude,
  });
}

export type LoadedThread = NonNullable<Awaited<ReturnType<typeof loadThread>>>;

/** Souhrn vláken k přihláškám: počet zpráv + nepřečtené pro danou stranu. */
export async function registrationThreadSummaries(
  keys: { year: number; id: number }[],
  viewer: MessageSide,
): Promise<Map<string, { threadId: number; count: number; unread: number; open: boolean }>> {
  const result = new Map<
    string,
    { threadId: number; count: number; unread: number; open: boolean }
  >();
  if (keys.length === 0) return result;
  const threads = await prisma.messageThread.findMany({
    where: { OR: keys.map((key) => ({ year: key.year, registrationId: key.id })) },
    include: { messages: { select: { side: true, createdAt: true } } },
  });
  for (const thread of threads) {
    if (thread.year === null || thread.registrationId === null) continue;
    const lastRead = viewer === "user" ? thread.lastReadByUser : thread.lastReadByStaff;
    result.set(regKey(thread.year, thread.registrationId), {
      threadId: thread.id,
      count: thread.messages.length,
      unread: countUnreadMessages(thread.messages, lastRead, viewer),
      open: thread.status === "open",
    });
  }
  return result;
}

export function summaryKey(year: number, id: number) {
  return regKey(year, id);
}

/** Otevřená vlákna s nepřečtenou zprávou přihlašujícího (odznak pořadatelů). */
export async function staffUnreadCount(): Promise<number> {
  return prisma.messageThread.count({
    where: {
      status: "open",
      lastUserMessageAt: { not: null },
      OR: [
        { lastReadByStaff: null },
        { lastUserMessageAt: { gt: prisma.messageThread.fields.lastReadByStaff } },
      ],
    },
  });
}

export async function userUnreadCount(session: SessionUser): Promise<number> {
  const regs = await userRegistrations(session.email);
  const threads = await prisma.messageThread.findMany({
    where: { ...userThreadWhere(session, regs), lastStaffMessageAt: { not: null } },
    select: {
      status: true,
      lastUserMessageAt: true,
      lastStaffMessageAt: true,
      lastReadByUser: true,
      lastReadByStaff: true,
    },
  });
  return countUnreadThreads(threads, "user");
}

export type HeaderMessages = { count: number; href: "/zpravy" | "/admin/zpravy" };

/**
 * Odznak v hlavičce. Anonymní návštěvník = žádný dotaz do DB.
 * Pořadatel: otevřená vlákna s nepřečtenou zprávou přihlašujícího → /admin/zpravy.
 * Přihlašující: vlákna s nepřečtenou odpovědí pořadatele → /zpravy.
 */
export const getUnreadCount = cache(async (): Promise<HeaderMessages | null> => {
  const session = await getSession();
  if (!session) return null;
  try {
    const settings = await getMessageSettings();
    const staff = isStaffRole(session.role);
    if (!settings.enabled && !staff) return null;
    return staff
      ? { count: await staffUnreadCount(), href: "/admin/zpravy" }
      : { count: await userUnreadCount(session), href: "/zpravy" };
  } catch (error) {
    console.error("[messages] unread count failed", error);
    return null;
  }
});

/** Využití limitů autora (zprávy za hodinu/den, vlákna za den). */
export async function rateUsage(userId: number, now = new Date()) {
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [lastHour, lastDay, threadsLastDay] = await Promise.all([
    prisma.message.count({
      where: { authorUserId: userId, side: "user", createdAt: { gte: hourAgo } },
    }),
    prisma.message.count({
      where: { authorUserId: userId, side: "user", createdAt: { gte: dayAgo } },
    }),
    prisma.messageThread.count({ where: { userId, createdAt: { gte: dayAgo } } }),
  ]);
  return { lastHour, lastDay, threadsLastDay };
}

export async function listAdminThreads(filters: AdminThreadFilters) {
  const threads = await prisma.messageThread.findMany({
    where: {
      ...(filters.status === "all" ? {} : { status: filters.status }),
      ...(filters.type === "registration"
        ? { registrationId: { not: null } }
        : filters.type === "general"
          ? { registrationId: null }
          : {}),
      ...(filters.year ? { year: filters.year } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: 300,
    include: {
      user: { select: { name: true, email: true } },
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, side: true } },
    },
  });
  const regKeys = threads
    .filter((thread) => thread.year !== null && thread.registrationId !== null)
    .map((thread) => ({ year: thread.year!, id: thread.registrationId! }));
  const regs =
    regKeys.length > 0
      ? await prisma.registration.findMany({
          where: { OR: regKeys.map((key) => ({ year: key.year, id: key.id })) },
          select: { year: true, id: true, name: true, email: true },
        })
      : [];
  const regMap = new Map(regs.map((reg) => [regKey(reg.year, reg.id), reg]));
  return threads
    .map((thread) => ({
      ...thread,
      registration:
        thread.year !== null && thread.registrationId !== null
          ? (regMap.get(regKey(thread.year, thread.registrationId)) ?? null)
          : null,
      unread: hasUnread(thread, "staff"),
    }))
    .filter((thread) => !filters.unreadOnly || thread.unread);
}
