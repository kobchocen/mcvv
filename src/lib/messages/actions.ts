"use server";

import { revalidatePath } from "next/cache";

import { formInt } from "@/lib/admin/parse";
import { requireStaff } from "@/lib/admin/staff";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getMessageSettings } from "@/lib/settings/messages";

import { emailMatches, normalizeMessageBody } from "./core";
import { scheduleUserNotification } from "./notify";
import {
  appendMessage,
  checkUserRate,
  ensureRegistrationThread,
  markRead,
  type PostResult,
} from "./service";
import { userCanAccessThread } from "./store";

export type MessageFormState = {
  status: "idle" | "ok" | "error";
  error?: string;
  /** Mění se po úspěchu – formulář se podle něj vyprázdní. */
  stamp?: number;
};

function revalidateMessages(threadId?: number) {
  revalidatePath("/[locale]/zpravy", "page");
  if (threadId) revalidatePath("/[locale]/zpravy/[id]", "page");
  revalidatePath("/[locale]/prihlasky", "page");
  revalidatePath("/[locale]/admin/zpravy", "page");
  revalidatePath("/[locale]/admin/zpravy/[id]", "page");
  revalidatePath("/[locale]/admin/prihlasky", "layout");
  revalidatePath("/[locale]/admin", "page");
}

function toState(result: PostResult): MessageFormState {
  return result.ok ? { status: "ok", stamp: Date.now() } : { status: "error", error: result.error };
}

/**
 * Přihlašující píše do vlákna (threadId), nebo zakládá vlákno ke své přihlášce
 * (year + registrationId). Psát lze i po uzávěrce přihlášek.
 */
export async function postUserMessage(
  _prev: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const session = await getSession();
  if (!session) return { status: "error", error: "forbidden" };
  const settings = await getMessageSettings();
  if (!settings.enabled) return { status: "error", error: "disabled" };
  const body = normalizeMessageBody(formData.get("body"));
  if (!body) return { status: "error", error: "invalid" };

  const threadIdRaw = formInt(formData, "threadId");
  let threadId: number;
  let newThread = false;
  if (threadIdRaw !== null) {
    const thread = await prisma.messageThread.findUnique({ where: { id: threadIdRaw } });
    if (!thread || !(await userCanAccessThread(thread, session))) {
      return { status: "error", error: "forbidden" };
    }
    threadId = thread.id;
  } else {
    const year = formInt(formData, "year");
    const registrationId = formInt(formData, "registrationId");
    if (year === null || registrationId === null) return { status: "error", error: "invalid" };
    const reg = await prisma.registration.findUnique({
      where: { year_id: { year, id: registrationId } },
      select: { email: true },
    });
    if (!emailMatches(reg?.email, session.email)) return { status: "error", error: "forbidden" };
    const existing = await prisma.messageThread.findUnique({
      where: { year_registrationId: { year, registrationId } },
      select: { id: true },
    });
    newThread = !existing;
    const limited = await checkUserRate(session, newThread);
    if (limited) return { status: "error", error: limited };
    threadId =
      existing?.id ?? (await ensureRegistrationThread(year, registrationId, session.id)).id;
    await appendMessage({ threadId, side: "user", authorUserId: session.id, body });
    revalidateMessages(threadId);
    return toState({ ok: true, threadId });
  }

  const limited = await checkUserRate(session, newThread);
  if (limited) return { status: "error", error: limited };
  await appendMessage({ threadId, side: "user", authorUserId: session.id, body });
  revalidateMessages(threadId);
  return toState({ ok: true, threadId });
}

/** „Potvrdit přečtení“ přihlašujícím. */
export async function markReadByUser(formData: FormData): Promise<void> {
  const session = await getSession();
  const threadId = formInt(formData, "threadId");
  if (!session || threadId === null) return;
  const thread = await prisma.messageThread.findUnique({ where: { id: threadId } });
  if (!thread || !(await userCanAccessThread(thread, session))) return;
  await markRead(thread.id, "user");
  revalidateMessages(thread.id);
}

/**
 * Pořadatel odpovídá (threadId), nebo zakládá vlákno k přihlášce bez vlákna
 * (year + registrationId).
 */
export async function postStaffMessage(
  _prev: MessageFormState,
  formData: FormData,
): Promise<MessageFormState> {
  const session = await requireStaff();
  const body = normalizeMessageBody(formData.get("body"));
  if (!body) return { status: "error", error: "invalid" };
  let threadId = formInt(formData, "threadId");
  if (threadId !== null) {
    const exists = await prisma.messageThread.findUnique({
      where: { id: threadId },
      select: { id: true },
    });
    if (!exists) return { status: "error", error: "invalid" };
  } else {
    const year = formInt(formData, "year");
    const registrationId = formInt(formData, "registrationId");
    if (year === null || registrationId === null) return { status: "error", error: "invalid" };
    const reg = await prisma.registration.findUnique({
      where: { year_id: { year, id: registrationId } },
      select: { email: true },
    });
    if (!reg) return { status: "error", error: "invalid" };
    const owner = reg.email
      ? await prisma.user.findUnique({
          where: { email: reg.email.trim().toLowerCase() },
          select: { id: true },
        })
      : null;
    threadId = (await ensureRegistrationThread(year, registrationId, owner?.id ?? null)).id;
  }
  await appendMessage({ threadId, side: "staff", authorUserId: session.id, body });
  try {
    await scheduleUserNotification(threadId);
  } catch (error) {
    console.error("[messages] notification failed", error);
  }
  revalidateMessages(threadId);
  return { status: "ok", stamp: Date.now() };
}

export async function markReadByStaff(formData: FormData): Promise<void> {
  await requireStaff();
  const threadId = formInt(formData, "threadId");
  if (threadId === null) return;
  const thread = await prisma.messageThread.findUnique({ where: { id: threadId } });
  if (!thread) return;
  await markRead(thread.id, "staff");
  revalidateMessages(thread.id);
}

/** Vyřešit / znovu otevřít vlákno (jen pořadatel). */
export async function setThreadStatus(formData: FormData): Promise<void> {
  await requireStaff();
  const threadId = formInt(formData, "threadId");
  const status = String(formData.get("status") ?? "");
  if (threadId === null || (status !== "open" && status !== "resolved")) return;
  await prisma.messageThread.updateMany({ where: { id: threadId }, data: { status } });
  revalidateMessages(threadId);
}
