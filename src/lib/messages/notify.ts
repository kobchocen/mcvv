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
import {
  CHANGES_MAX_REGISTRATIONS,
  loadDueEntryChanges,
  saveChangesCursor,
} from "@/lib/entries/changes";

import {
  excerpt,
  renderOrganizerDigest,
  renderUserNotification,
  type DigestItem,
} from "./mail-render";

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

export type DigestResult = {
  skipped?: string;
  threads: number;
  /** Přihlášky se změnami v souhrnu (#130). */
  registrations?: number;
  queued: boolean;
};

type DigestThreadRow = Awaited<ReturnType<typeof loadDigestThreads>>[number];

async function loadDigestThreads(now: Date) {
  const candidates = await prisma.messageThread.findMany({
    where: { status: "open", lastUserMessageAt: { not: null } },
    include: { messages: { select: { side: true, createdAt: true, body: true } } },
  });
  return digestThreads(candidates, now);
}

async function messageItems(due: DigestThreadRow[]): Promise<DigestItem[]> {
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
  return due.map((thread) => {
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
}

/**
 * Denní souhrn pořadateli max. 1× denně (klíč podle pražského dne). Volá cron e-mailové fronty.
 * Sekce: nepřečtené zprávy (`messages.notify_organizer`) a změny přihlášek
 * (`entries.notify_changes`, #130). Odejde, jakmile má aspoň jedna zapnutá sekce obsah.
 */
export async function runOrganizerDigest(now = new Date()): Promise<DigestResult> {
  const settings = await getMessageSettings();
  const withMessages = settings.enabled && settings.notifyOrganizer;
  const withChanges = settings.notifyChanges;
  if (!withMessages && !withChanges) {
    return { skipped: "disabled", threads: 0, queued: false };
  }
  const dedupeKey = digestDedupeKey(now, env.TIME_ZONE);
  const already = await prisma.mailQueue.findUnique({ where: { dedupeKey }, select: { id: true } });
  if (already) return { skipped: "already-today", threads: 0, queued: false };

  const due = withMessages ? await loadDigestThreads(now) : [];
  const changes = withChanges
    ? await loadDueEntryChanges(now)
    : { groups: [], lastId: 0, count: 0 };
  if (due.length === 0 && changes.groups.length === 0) {
    return { threads: 0, registrations: 0, queued: false };
  }
  const shown = changes.groups.slice(0, CHANGES_MAX_REGISTRATIONS);
  const mail = renderOrganizerDigest({
    site: site(),
    adminUrl: `${site()}/cs/admin/zpravy`,
    items: await messageItems(due),
    changes: shown.map((group) => ({
      label: `přihláška ${group.year}/${group.registrationId}${group.name ? ` – ${group.name}` : ""}${group.email ? ` (${group.email})` : ""}`,
      url: `${site()}/cs/admin/prihlasky/${group.year}/${group.registrationId}`,
      lines: group.lines.map((line) => `${formatChangeTime(line.at)} ${line.text}`),
    })),
    changesMore: changes.groups.length - shown.length,
    registrationsUrl: `${site()}/cs/admin/prihlasky`,
  });
  const { created } = await enqueueMail({
    ...mail,
    to: await getOrganizerEmail(),
    kind: "message",
    dedupeKey,
  });
  if (created) {
    if (due.length > 0) {
      await prisma.messageThread.updateMany({
        where: { id: { in: due.map((thread) => thread.id) } },
        data: { staffNotifiedAt: now },
      });
    }
    if (changes.count > 0) {
      await saveChangesCursor(changes.lastId);
    }
  }
  return { threads: due.length, registrations: changes.groups.length, queued: created };
}

function formatChangeTime(at: Date): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: env.TIME_ZONE,
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}
