import { prisma } from "@/lib/db/client";
import { env } from "@/lib/env";
import { enqueueMail } from "@/lib/mail/queue";
import { getMessageSettings, getOrganizerEmail } from "@/lib/settings/messages";

import {
  countUnreadMessages,
  digestDedupeKey,
  digestThreads,
  shouldNotifyUser,
  USER_NOTIFY_KEY_PREFIX,
  USER_NOTIFY_QUIET_MS,
  userNotifyDedupeKey,
} from "./core";
import { excerpt, renderOrganizerDigest, renderUserNotification } from "./mail-render";

function site(): string {
  return (env.AUTH_ORIGIN ?? "https://www.mcvv.org").replace(/\/$/, "");
}

/** Jen produkce posílá upozornění skutečným přihlašujícím (STG má kopii reálných e-mailů). */
export function userNotifyRedirected(): boolean {
  const appEnv = (env.APP_ENV ?? "").toLowerCase();
  return !(appEnv === "prod" || appEnv === "production");
}

export function threadLabel(thread: {
  year: number | null;
  registrationId: number | null;
  subject: string | null;
}): string {
  if (thread.year !== null && thread.registrationId !== null) {
    return `přihláška ${thread.year}/${thread.registrationId}`;
  }
  return thread.subject ? `„${thread.subject}“` : "dotaz";
}

/**
 * Po odpovědi pořadatele: zařadí 1 upozornění na vlákno a cyklus čtení s klidovou dobou
 * ~10 min (odchází s během fronty). Nízká priorita (kind „message“) – nesahá na rezervu.
 */
export async function scheduleUserNotification(threadId: number, now = new Date()): Promise<void> {
  const settings = await getMessageSettings();
  if (!settings.enabled || !settings.notifyUser) return;
  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    include: {
      user: { select: { email: true } },
      messages: { where: { side: "staff" }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!thread || !shouldNotifyUser(thread)) return;
  let to: string | null = thread.user?.email ?? null;
  if (thread.year !== null && thread.registrationId !== null) {
    const reg = await prisma.registration.findUnique({
      where: { year_id: { year: thread.year, id: thread.registrationId } },
      select: { email: true },
    });
    to = reg?.email?.trim().toLowerCase() || null;
  }
  if (!to) return;
  const firstUnread =
    thread.messages.find(
      (message) => !thread.lastReadByUser || message.createdAt > thread.lastReadByUser,
    ) ?? thread.messages.at(-1);
  if (!firstUnread) return;
  const redirected = userNotifyRedirected();
  const mail = renderUserNotification({
    site: site(),
    threadUrl: `${site()}/cs/zpravy/${thread.id}`,
    label: threadLabel(thread),
    body: firstUnread.body,
  });
  await enqueueMail({
    ...mail,
    subject: redirected ? `[TEST – pro ${to.replace(/@.*/, "@…")}] ${mail.subject}` : mail.subject,
    to: redirected ? await getOrganizerEmail() : to,
    kind: "message",
    dedupeKey: userNotifyDedupeKey(thread.id, thread.lastReadByUser),
    notBefore: new Date(now.getTime() + USER_NOTIFY_QUIET_MS),
  });
  await prisma.messageThread.update({
    where: { id: thread.id },
    data: { userNotifiedAt: now },
  });
}

/** Přihlašující vlákno přečetl dřív, než upozornění odešlo → zrušit čekající e-mail. */
export async function cancelPendingUserNotification(threadId: number): Promise<void> {
  await prisma.mailQueue.deleteMany({
    where: {
      kind: "message",
      status: "pending",
      dedupeKey: { startsWith: USER_NOTIFY_KEY_PREFIX(threadId) },
    },
  });
}

export type DigestResult = { skipped?: string; threads: number; queued: boolean };

/**
 * Souhrn pro pořadatele max. 1× denně (klíč podle pražského dne). Volá cron e-mailové fronty.
 */
export async function runMessageDigest(now = new Date()): Promise<DigestResult> {
  const settings = await getMessageSettings();
  if (!settings.enabled || !settings.notifyOrganizer) {
    return { skipped: "disabled", threads: 0, queued: false };
  }
  const dedupeKey = digestDedupeKey(now, env.TIME_ZONE);
  const already = await prisma.mailQueue.findUnique({ where: { dedupeKey }, select: { id: true } });
  if (already) return { skipped: "already-today", threads: 0, queued: false };
  const candidates = await prisma.messageThread.findMany({
    where: { status: "open", lastUserMessageAt: { not: null } },
    include: { messages: { select: { side: true, createdAt: true, body: true } } },
  });
  const due = digestThreads(candidates, now);
  if (due.length === 0) return { threads: 0, queued: false };
  const regKeys = due
    .filter((thread) => thread.year !== null && thread.registrationId !== null)
    .map((thread) => ({ year: thread.year!, id: thread.registrationId! }));
  const regs =
    regKeys.length > 0
      ? await prisma.registration.findMany({
          where: { OR: regKeys },
          select: { year: true, id: true, name: true },
        })
      : [];
  const names = new Map(regs.map((reg) => [`${reg.year}/${reg.id}`, reg.name]));
  const items = due.map((thread) => {
    const name =
      thread.year !== null && thread.registrationId !== null
        ? names.get(`${thread.year}/${thread.registrationId}`)
        : null;
    const lastUser = [...thread.messages].reverse().find((message) => message.side === "user");
    return {
      label: `${threadLabel(thread)}${name ? ` – ${name}` : ""}`,
      excerpt: excerpt(lastUser?.body ?? ""),
      url: `${site()}/cs/admin/zpravy/${thread.id}`,
      unread: countUnreadMessages(thread.messages, thread.lastReadByStaff, "staff"),
    };
  });
  const mail = renderOrganizerDigest({
    site: site(),
    adminUrl: `${site()}/cs/admin/zpravy`,
    items,
  });
  const { created } = await enqueueMail({
    ...mail,
    to: await getOrganizerEmail(),
    kind: "message",
    dedupeKey,
  });
  if (created) {
    await prisma.messageThread.updateMany({
      where: { id: { in: due.map((thread) => thread.id) } },
      data: { staffNotifiedAt: now },
    });
  }
  return { threads: due.length, queued: created };
}
